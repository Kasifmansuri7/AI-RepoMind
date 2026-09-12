from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from .state import AgentState
from backend.rag.search import CodeSearcher
from backend.db.client import get_qdrant_client
from backend.ingestion.embedder import Embedder
import json

# We use the reliable gpt-4o-mini for fast, cheap agent interactions
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# 1. PLANNER
planner_llm = llm.bind_tools([
    {
        "type": "function",
        "function": {
            "name": "generate_plan",
            "description": "Generate a plan and search queries",
            "parameters": {
                "type": "object",
                "properties": {
                    "plan": {"type": "string"},
                    "search_queries": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["plan", "search_queries"]
            }
        }
    }
], tool_choice="generate_plan")

def planner_node(state: AgentState):
    print("--- PLANNER ---")
    system_prompt = (
        "You are a software architect. Create a plan to solve the user's task and "
        "provide exactly 1-3 highly specific code search queries to find relevant code in the vector database. "
        "Use the chat history for context if necessary."
    )
    user_content = f"Chat History:\n{state.get('chat_history', '')}\n\nCurrent Task: {state['task']}"
    response = planner_llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content)
    ])
    
    args = response.tool_calls[0]["args"]
    return {"plan": args["plan"], "search_queries": args["search_queries"]}

# 2. SEARCH CONTEXT
def search_node(state: AgentState):
    print("--- SEARCHING RAG ---")
    try:
        q_client = get_qdrant_client()
        embedder = Embedder()
        searcher = CodeSearcher(q_client=q_client, embedder=embedder)
        
        all_results = []
        for query in state["search_queries"]:
            results = searcher.search(
                query=query, 
                tenant_id=state["tenant_id"], 
                repo_name=state.get("repo_name"), 
                limit=3
            )
            for res in results:
                all_results.append(f"File: {res['file_path']}\n{res['content']}")
                
        # Deduplicate
        all_results = list(dict.fromkeys(all_results))
        context = "\n\n---\n\n".join(all_results)
        
        if not context:
            context = "No relevant code found."
            
        return {"context": context}
    except Exception as e:
        print(f"Search failed: {e}")
        return {"context": f"Search failed: {e}"}

# 3. CODER
def coder_node(state: AgentState):
    print("--- CODER ---")
    system_prompt = (
        "You are an expert developer. Write the code or explanation to fulfill the user's task. "
        "Use the provided codebase context and the architect's plan. "
        "If you are modifying code, output the full updated file or snippet."
    )
    
    user_content = f"Chat History:\n{state.get('chat_history', '')}\n\nCurrent Task: {state['task']}\n\nPlan: {state['plan']}\n\nContext:\n{state['context']}"
    if state.get("review_feedback"):
        user_content += f"\n\nReviewer Feedback from previous attempt (Fix these issues):\n{state['review_feedback']}"
        
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content)
    ])
    
    return {"draft_code": response.content}

# 4. REVIEWER
reviewer_llm = llm.bind_tools([
    {
        "type": "function",
        "function": {
            "name": "submit_review",
            "description": "Submit a review of the code",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["approve", "rewrite", "replan"],
                        "description": "approve if code solves task. rewrite if context is good but code is wrong. replan if the context is missing necessary files/info."
                    },
                    "feedback": {"type": "string", "description": "Constructive feedback if rejected, or empty if approved."}
                },
                "required": ["action", "feedback"]
            }
        }
    }
], tool_choice="submit_review")

def reviewer_node(state: AgentState):
    print("--- REVIEWER ---")
    system_prompt = (
        "You are a strict code reviewer. Check if the draft code fulfills the original task. "
        "Ensure there are no obvious syntax errors or missing context. "
        "If it is good, approve it. If not, provide specific feedback on what to fix."
    )
    
    user_content = f"Task: {state['task']}\n\nDraft Code:\n{state['draft_code']}"
    
    response = reviewer_llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content)
    ])
    
    args = response.tool_calls[0]["args"]
    current_revisions = state.get("revision_number", 0)
    
    return {
        "review_action": args["action"],
        "review_feedback": args["feedback"],
        "revision_number": current_revisions + 1
    }

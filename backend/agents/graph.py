from langgraph.graph import StateGraph, END
from .state import AgentState
from .nodes import planner_node, search_node, coder_node, reviewer_node

def route_review(state: AgentState):
    action = state.get("review_action")
    
    if action == "approve":
        return END
    
    # Hard limit to prevent infinite loops
    if state.get("revision_number", 0) >= state.get("max_revisions", 3):
        print("--- MAX REVISIONS REACHED ---")
        return END
        
    if action == "replan":
        print("--- REJECTED: MISSING CONTEXT. LOOPING TO PLANNER ---")
        return "planner"
        
    print("--- REJECTED: BUGGY CODE. LOOPING TO CODER ---")
    return "coder"

def build_graph():
    builder = StateGraph(AgentState)
    
    # Add nodes
    builder.add_node("planner", planner_node)
    builder.add_node("search", search_node)
    builder.add_node("coder", coder_node)
    builder.add_node("reviewer", reviewer_node)
    
    # Define flow
    builder.set_entry_point("planner")
    builder.add_edge("planner", "search")
    builder.add_edge("search", "coder")
    builder.add_edge("coder", "reviewer")
    
    # Conditional edge from reviewer
    builder.add_conditional_edges("reviewer", route_review)
    
    return builder.compile()

# Compile the graph
agent_graph = build_graph()

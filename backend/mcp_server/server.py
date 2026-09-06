import os
import sys
from dotenv import load_dotenv

# Ensure we load the .env file from the backend directory regardless of where Claude runs this
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(backend_dir, ".env"))

# Add backend to path so we can import our existing modules
sys.path.append(os.path.dirname(backend_dir))

from mcp.server.fastmcp import FastMCP
from backend.db.client import get_qdrant_client
from backend.ingestion.embedder import Embedder
from backend.rag.search import CodeSearcher
from backend.agents.graph import agent_graph

# Create the MCP Server 
mcp = FastMCP("AI RepoMind Codebase Assistant")

@mcp.tool()
def search_codebase(query: str, repo_name: str = None) -> str:
    """
    Search the indexed codebase for specific code snippets, functions, or concepts.
    This tool performs a semantic vector search over the codebase.
    
    Args:
        query: The natural language query or specific code symbol to search for.
        repo_name: Optional. Limit the search to a specific repository name if the tenant has multiple.
    """
    tenant_id = os.getenv("MCP_TENANT_ID")
    if not tenant_id:
        return "Error: MCP_TENANT_ID environment variable is not set. Please configure it in your Claude Desktop config."
        
    try:
        q_client = get_qdrant_client()
        embedder = Embedder()
        searcher = CodeSearcher(q_client=q_client, embedder=embedder)
        
        results = searcher.search(query=query, tenant_id=tenant_id, repo_name=repo_name, limit=5)
        
        if not results:
            if repo_name:
                return f"No results found for '{query}' in repository '{repo_name}' (tenant: {tenant_id})."
            return f"No results found for '{query}' across any repositories for tenant '{tenant_id}'."
            
        # Format the results into a readable string for Claude
        formatted_response = f"Found {len(results)} relevant code snippets:\n\n"
        for i, res in enumerate(results, 1):
            formatted_response += f"--- Result {i} (Score: {res['score']:.3f}) ---\n"
            formatted_response += f"File: {res['file_path']}\n"
            formatted_response += "-" * 40 + "\n"
            formatted_response += f"{res['content']}\n\n"
            
        return formatted_response
        
    except Exception as e:
        return f"An error occurred while searching the codebase: {str(e)}"

@mcp.tool()
def autonomous_agent_task(task_description: str, repo_name: str = None) -> str:
    """
    Run an autonomous agent (Planner -> Searcher -> Coder -> Reviewer) to fulfill complex codebase tasks.
    Use this for complex bug fixes, feature implementations, or deep refactoring tasks.
    
    Args:
        task_description: Detailed explanation of what the agent needs to do.
        repo_name: Optional. Restrict to a specific repo.
    """
    tenant_id = os.getenv("MCP_TENANT_ID")
    if not tenant_id:
        return "Error: MCP_TENANT_ID environment variable is not set."
        
    initial_state = {
        "task": task_description,
        "tenant_id": tenant_id,
        "repo_name": repo_name,
        "revision_number": 0,
        "max_revisions": 3
    }
    
    try:
        final_state = agent_graph.invoke(initial_state)
        response = f"**Agent Plan:**\n{final_state['plan']}\n\n"
        response += f"**Final Approved Output:**\n{final_state['draft_code']}"
        return response
    except Exception as e:
        return f"Agent failed: {e}"

if __name__ == "__main__":
    # Start the stdio server (this is what Claude Desktop connects to)
    mcp.run()

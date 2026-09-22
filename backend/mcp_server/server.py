import os
import sys
import subprocess
import uuid
from dotenv import load_dotenv

# Ensure we load the .env file from the backend directory regardless of where Claude runs this
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(backend_dir, ".env"))

# Add backend to path so we can import our existing modules
sys.path.append(os.path.dirname(backend_dir))

from mcp.server.mcpserver import MCPServer
from backend.db.client import get_qdrant_client
from backend.ingestion.embedder import Embedder
from backend.rag.search import CodeSearcher
from backend.agents.graph import agent_graph
from backend.db.postgres import SessionLocal
from backend.ingestion.pipeline import ingest_repository_generator

# Create the MCP Server 
mcp = MCPServer("AI RepoMind Codebase Assistant")

# In-memory storage for pending human-in-the-loop proposals
_pending_proposals = {}

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
        return "Error: MCP_TENANT_ID environment variable is not set. Please configure it in your Claude Desktop config (we recommend using your email address to ensure uniqueness)."
        
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
def propose_autonomous_task(task_description: str, repo_name: str = None) -> str:
    """
    Propose an autonomous agent task (Planner -> Searcher -> Coder -> Reviewer) to fulfill complex codebase tasks.
    This runs the agent up to the Planner step, and then pauses to wait for your approval.
    
    Args:
        task_description: Detailed explanation of what the agent needs to do.
        repo_name: Optional. Restrict to a specific repo.
    """
    tenant_id = os.getenv("MCP_TENANT_ID")
    if not tenant_id:
        return "Error: MCP_TENANT_ID environment variable is not set. Please configure it with a unique ID (like your email)."
        
    initial_state = {
        "task": task_description,
        "tenant_id": tenant_id,
        "repo_name": repo_name,
        "revision_number": 0,
        "max_revisions": 3
    }
    
    proposal_id = str(uuid.uuid4())[:8]
    config = {"configurable": {"thread_id": proposal_id}}
    
    try:
        # Run until the interrupt (after planner)
        agent_graph.invoke(initial_state, config=config)
        
        # Get the current state
        state = agent_graph.get_state(config)
        plan = state.values.get("plan", "No plan generated.")
        
        _pending_proposals[proposal_id] = {
            "type": "agent_task",
            "thread_id": proposal_id
        }
        
        response = f"**Agent Plan:**\n{plan}\n\n"
        response += f"This is a proposed plan. To execute this plan, please call `apply_proposal` with ID {proposal_id}."
        return response
    except Exception as e:
        return f"Agent failed: {e}"

@mcp.tool()
async def index_local_repo(local_path: str) -> str:
    """
    Index a local directory on your machine so it can be searched by the codebase assistant.
    This reads the local files directly without cloning.
    
    Args:
        local_path: The absolute path to the local directory.
    """
    tenant_id = os.getenv("MCP_TENANT_ID")
    if not tenant_id:
        return "Error: MCP_TENANT_ID environment variable is not set. Please configure it with a unique ID (like your email)."
        
    db = SessionLocal()
    status_updates = []
    try:
        # The generator yields progress events as dicts: {"event": "...", "data": "..."}
        for event in ingest_repository_generator(source=local_path, tenant_id=tenant_id, db=db):
            event_type = event.get("event")
            data = event.get("data")
            
            if event_type == "error":
                return f"Ingestion failed: {data}\n\nLog: " + " | ".join(status_updates)
            
            if event_type == "status":
                status_updates.append(str(data))
                
            if event_type == "success":
                return f"Successfully indexed local repository '{data}'!\n\nDetails:\n" + "\n".join(f"- {msg}" for msg in status_updates)
                
        return "Ingestion finished but no success event was received. Log: " + " | ".join(status_updates)
    except Exception as e:
        return f"An error occurred while indexing local repository: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def write_to_local_file(file_path: str, content: str) -> str:
    """
    Write or overwrite a file on the local filesystem. 
    Use this when the user asks you to create or modify a file locally.
    
    Args:
        file_path: The absolute path where the file should be written.
        content: The entire text content to write to the file.
    """
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"Successfully wrote to {file_path}"
    except Exception as e:
        return f"Failed to write to file {file_path}. Error: {str(e)}"

@mcp.tool()
def read_local_file(file_path: str) -> str:
    """
    Read the entire contents of a file on the local filesystem.
    
    Args:
        file_path: The absolute path to the file.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Failed to read file {file_path}. Error: {str(e)}"

@mcp.tool()
def list_directory(directory_path: str) -> str:
    """
    List the contents of a directory on the local filesystem.
    
    Args:
        directory_path: The absolute path to the directory.
    """
    try:
        items = os.listdir(directory_path)
        result = [f"Contents of {directory_path}:"]
        for item in items:
            full_path = os.path.join(directory_path, item)
            if os.path.isdir(full_path):
                result.append(f"[DIR]  {item}/")
            else:
                result.append(f"[FILE] {item}")
        return "\n".join(result)
    except Exception as e:
        return f"Failed to list directory {directory_path}. Error: {str(e)}"

@mcp.tool()
def direct_edit_local_file(file_path: str, target_text: str, replacement_text: str) -> str:
    """
    Directly edit a file by finding a specific block of text and replacing it with new text.
    The target_text must match exactly what is in the file.
    Use this only when explicit permission isn't needed, otherwise use propose_file_edit.
    
    Args:
        file_path: The absolute path to the file.
        target_text: The exact text block to search for and replace.
        replacement_text: The text to replace the target with.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if target_text not in content:
            return f"Error: target_text not found in {file_path}. Please read the file again to ensure exact match."
            
        new_content = content.replace(target_text, replacement_text, 1)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        return f"Successfully updated {file_path}"
    except Exception as e:
        return f"Failed to edit file {file_path}. Error: {str(e)}"

@mcp.tool()
def direct_run_terminal_command(command: str, cwd: str = None) -> str:
    """
    Directly run a shell command on the local machine and return its output.
    Use this only when explicit permission isn't needed, otherwise use propose_terminal_command.
    
    Args:
        command: The shell command to run (e.g., 'npm test', 'dir', 'cat file.txt').
        cwd: Optional current working directory to run the command in.
    """
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            capture_output=True,
            text=True
        )
        output = f"Command exited with code {result.returncode}\n"
        if result.stdout:
            output += f"--- STDOUT ---\n{result.stdout}\n"
        if result.stderr:
            output += f"--- STDERR ---\n{result.stderr}\n"
        return output
    except Exception as e:
        return f"Failed to run command. Error: {str(e)}"

@mcp.tool()
def propose_file_edit(file_path: str, target_text: str, replacement_text: str) -> str:
    """
    Propose an edit to a file. This does NOT execute the edit immediately.
    Instead, it creates a proposal that you must show to the user for approval.
    The target_text must match exactly what is in the file.
    
    Args:
        file_path: The absolute path to the file.
        target_text: The exact text block to search for and replace.
        replacement_text: The text to replace the target with.
    """
    proposal_id = str(uuid.uuid4())[:8]
    _pending_proposals[proposal_id] = {
        "type": "file_edit",
        "file_path": file_path,
        "target_text": target_text,
        "replacement_text": replacement_text
    }
    return f"Proposal {proposal_id} created. You MUST now show the proposed diff to the user and ask for their approval. If they approve, call apply_proposal with this ID."

@mcp.tool()
def propose_terminal_command(command: str, cwd: str = None) -> str:
    """
    Propose a shell command to run on the user's machine. This does NOT execute it immediately.
    Instead, it creates a proposal that you must show to the user for approval.
    
    Args:
        command: The shell command to run.
        cwd: Optional current working directory.
    """
    proposal_id = str(uuid.uuid4())[:8]
    _pending_proposals[proposal_id] = {
        "type": "terminal_command",
        "command": command,
        "cwd": cwd
    }
    return f"Proposal {proposal_id} created. You MUST now show the proposed command to the user and ask for their approval. If they approve, call apply_proposal with this ID."

@mcp.tool()
def apply_proposal(proposal_id: str) -> str:
    """
    Apply a previously created proposal after the user has explicitly approved it.
    
    Args:
        proposal_id: The ID of the proposal to execute.
    """
    if proposal_id not in _pending_proposals:
        return f"Error: Proposal {proposal_id} not found or already executed."
        
    proposal = _pending_proposals.pop(proposal_id)
    
    if proposal["type"] == "file_edit":
        # Execute the edit
        try:
            with open(proposal["file_path"], 'r', encoding='utf-8') as f:
                content = f.read()
            if proposal["target_text"] not in content:
                return f"Error: target_text not found in {proposal['file_path']} during execution."
            new_content = content.replace(proposal["target_text"], proposal["replacement_text"], 1)
            with open(proposal["file_path"], 'w', encoding='utf-8') as f:
                f.write(new_content)
            return f"Successfully applied file edit proposal {proposal_id} to {proposal['file_path']}."
        except Exception as e:
            return f"Failed to execute file edit proposal {proposal_id}. Error: {str(e)}"
            
    elif proposal["type"] == "terminal_command":
        # Execute the command
        try:
            result = subprocess.run(
                proposal["command"],
                cwd=proposal.get("cwd"),
                shell=True,
                capture_output=True,
                text=True
            )
            output = f"Command exited with code {result.returncode}\n"
            if result.stdout:
                output += f"--- STDOUT ---\n{result.stdout}\n"
            if result.stderr:
                output += f"--- STDERR ---\n{result.stderr}\n"
            return f"Successfully executed command proposal {proposal_id}.\n{output}"
        except Exception as e:
            return f"Failed to execute command proposal {proposal_id}. Error: {str(e)}"
            
    elif proposal["type"] == "agent_task":
        # Resume the agent graph
        config = {"configurable": {"thread_id": proposal["thread_id"]}}
        try:
            # Resuming graph with None state continues from the interrupt
            final_state = agent_graph.invoke(None, config=config)
            response = f"**Final Approved Output:**\n{final_state.get('draft_code', 'No code generated.')}"
            return response
        except Exception as e:
            return f"Agent failed to execute: {e}"

if __name__ == "__main__":
    # Start the stdio server (this is what Claude Desktop connects to)
    mcp.run()

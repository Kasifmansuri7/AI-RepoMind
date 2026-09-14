import base64
import requests

def get_github_tree(owner: str, repo: str, branch: str, token: str) -> dict:
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        raise Exception(f"GitHub API Error: {response.text}")
        
    data = response.json()
    
    tree_out = {"name": repo, "type": "directory", "children": []}
    dirs = {"": tree_out}
    items = data.get("tree", [])
    
    for item in items:
        path_parts = item["path"].split("/")
        name = path_parts[-1]
        parent_path = "/".join(path_parts[:-1])
        
        node = {
            "name": name,
            "path": item["path"],
            "type": "directory" if item["type"] == "tree" else "file"
        }
        
        if node["type"] == "directory":
            node["children"] = []
            dirs[item["path"]] = node
            
        if parent_path in dirs:
            dirs[parent_path]["children"].append(node)
        else:
            tree_out["children"].append(node)
            
    def sort_children(node):
        if "children" in node:
            node["children"].sort(key=lambda x: (0 if x["type"] == "directory" else 1, x["name"].lower()))
            for child in node["children"]:
                sort_children(child)
                
    sort_children(tree_out)
    return tree_out

def get_github_file_content(owner: str, repo: str, path: str, token: str) -> str:
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    response = requests.get(url, headers=headers)
    if response.status_code == 404:
        raise FileNotFoundError(f"File not found on GitHub: {path}")
    if response.status_code != 200:
        raise Exception(f"GitHub API Error: {response.text}")
        
    data = response.json()
    if data.get("encoding") == "base64":
        return base64.b64decode(data["content"]).decode("utf-8")
    elif "content" in data:
        return data["content"]
    else:
        raise Exception("Unable to decode content from GitHub")

def commit_github_file(owner: str, repo: str, path: str, content: str, token: str, message: str, branch: str = "main"):
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    sha = None
    get_resp = requests.get(url, headers=headers)
    if get_resp.status_code == 200:
        sha = get_resp.json().get("sha")
        
    payload = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
        "branch": branch
    }
    if sha:
        payload["sha"] = sha
        
    response = requests.put(url, headers=headers, json=payload)
    if response.status_code not in (200, 201):
        raise Exception(f"GitHub API Error: {response.text}")

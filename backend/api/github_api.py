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

def bulk_commit_github_files(owner: str, repo: str, branch: str, token: str, message: str, files: dict) -> dict:
    """
    Commits multiple files in a single GitHub commit.
    files is a dict mapping file path to new file content.
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    base_url = f"https://api.github.com/repos/{owner}/{repo}"
    
    # 1. Get branch ref
    ref_resp = requests.get(f"{base_url}/git/refs/heads/{branch}", headers=headers)
    if ref_resp.status_code != 200:
        raise Exception(f"Failed to get branch ref: {ref_resp.text}")
    commit_sha = ref_resp.json()["object"]["sha"]
    
    # 2. Get commit base tree
    commit_resp = requests.get(f"{base_url}/git/commits/{commit_sha}", headers=headers)
    if commit_resp.status_code != 200:
        raise Exception(f"Failed to get commit: {commit_resp.text}")
    base_tree_sha = commit_resp.json()["tree"]["sha"]
    
    # 3. Create blobs for each file
    tree_items = []
    for path, content in files.items():
        blob_payload = {
            "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
            "encoding": "base64"
        }
        blob_resp = requests.post(f"{base_url}/git/blobs", headers=headers, json=blob_payload)
        if blob_resp.status_code != 201:
            raise Exception(f"Failed to create blob for {path}: {blob_resp.text}")
        blob_sha = blob_resp.json()["sha"]
        
        tree_items.append({
            "path": path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha
        })
        
    # 4. Create new tree
    tree_payload = {
        "base_tree": base_tree_sha,
        "tree": tree_items
    }
    tree_resp = requests.post(f"{base_url}/git/trees", headers=headers, json=tree_payload)
    if tree_resp.status_code != 201:
        raise Exception(f"Failed to create tree: {tree_resp.text}")
    new_tree_sha = tree_resp.json()["sha"]
    
    # 5. Create new commit
    commit_payload = {
        "message": message,
        "tree": new_tree_sha,
        "parents": [commit_sha]
    }
    new_commit_resp = requests.post(f"{base_url}/git/commits", headers=headers, json=commit_payload)
    if new_commit_resp.status_code != 201:
        raise Exception(f"Failed to create commit: {new_commit_resp.text}")
    new_commit_sha = new_commit_resp.json()["sha"]
    
    # 6. Update branch ref
    update_ref_payload = {
        "sha": new_commit_sha
    }
    update_ref_resp = requests.patch(f"{base_url}/git/refs/heads/{branch}", headers=headers, json=update_ref_payload)
    if update_ref_resp.status_code != 200:
        raise Exception(f"Failed to update branch ref: {update_ref_resp.text}")
    
    return update_ref_resp.json()

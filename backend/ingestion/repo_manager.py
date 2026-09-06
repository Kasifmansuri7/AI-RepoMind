import os
import subprocess
from pathlib import Path
import tempfile
import shutil

class RepoManager:
    def __init__(self, base_dir: str = None):
        if base_dir:
            self.base_dir = Path(base_dir)
            self.base_dir.mkdir(parents=True, exist_ok=True)
        else:
            self.base_dir = Path(tempfile.gettempdir()) / "ai_codebase_assistant_repos"
            self.base_dir.mkdir(parents=True, exist_ok=True)

    def load_local_repo(self, path: str) -> Path:
        """Validates and returns the path to a local repository."""
        repo_path = Path(path)
        if not repo_path.exists() or not repo_path.is_dir():
            raise ValueError(f"Local path does not exist or is not a directory: {path}")
        return repo_path

    def clone_remote_repo(self, url: str) -> Path:
        """Clones a remote repository into a temporary directory."""
        repo_name = url.split("/")[-1].replace(".git", "")
        dest_dir = self.base_dir / repo_name
        
        if dest_dir.exists():
            print(f"Repo already exists at {dest_dir}, re-cloning...")
            shutil.rmtree(dest_dir)
            
        print(f"Cloning {url} into {dest_dir}...")
        subprocess.run(
            ["git", "clone", "--depth", "1", url, str(dest_dir)], 
            check=True,
            capture_output=True
        )
        return dest_dir

    def get_files(self, repo_path: Path, extensions: list[str] = None) -> list[Path]:
        """Recursively get all relevant files from a repo path."""
        files = []
        for root, _, filenames in os.walk(repo_path):
            if ".git" in root or "node_modules" in root or "venv" in root:
                continue
            for filename in filenames:
                if extensions is None or any(filename.endswith(ext) for ext in extensions):
                    files.append(Path(root) / filename)
        return files

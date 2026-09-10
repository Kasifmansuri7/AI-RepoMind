import os
import subprocess
from pathlib import Path
import shutil
from dotenv import load_dotenv

# Load environment variables if available
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

class RepoManager:
    def __init__(self, base_dir: str = None):
        if base_dir:
            self.base_dir = Path(base_dir).resolve()
        else:
            repos_env = os.getenv("REPOS_DIR")
            if repos_env:
                self.base_dir = Path(repos_env).resolve()
            else:
                project_root = Path(__file__).resolve().parent.parent.parent
                self.base_dir = (project_root / "repos").resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def load_local_repo(self, path: str) -> Path:
        """Validates and returns the path to a local repository."""
        repo_path = Path(path).resolve()
        if not repo_path.exists() or not repo_path.is_dir():
            raise ValueError(f"Local path does not exist or is not a directory: {path}")
        return repo_path

    def clone_remote_repo(self, url: str, token: str = None, tenant_id: str = None) -> Path:
        """Clones a remote repository into the designated directory. Supports tenant isolation and auth token."""
        # Normalize URL: remove trailing slashes and ensure it ends with .git
        clean_url = url.strip().rstrip("/")
        if not clean_url.endswith(".git"):
            clean_url += ".git"
            
        repo_name = clean_url.split("/")[-1].replace(".git", "")
        if tenant_id:
            dest_dir = self.base_dir / tenant_id / repo_name
        else:
            dest_dir = self.base_dir / repo_name
        
        if dest_dir.exists():
            print(f"Repo already exists at {dest_dir}, cleaning up before re-cloning...")
            self.cleanup_repo(dest_dir)
            
        dest_dir.parent.mkdir(parents=True, exist_ok=True)
        print(f"Cloning {url} into {dest_dir}...")
        
        clone_url = clean_url
        if token:
            if clone_url.startswith("https://"):
                clone_url = f"https://{token}@{clone_url[8:]}"
            elif clone_url.startswith("http://"):
                clone_url = f"http://{token}@{clone_url[7:]}"

        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        
        subprocess.run(
            ["git", "clone", "--depth", "1", clone_url, str(dest_dir)], 
            check=True,
            capture_output=True,
            env=env
        )
        return dest_dir

    def cleanup_repo(self, repo_path: Path):
        """Safely removes the repository directory if it resides inside base_dir."""
        if not repo_path or not repo_path.exists():
            return

        try:
            repo_path.resolve().relative_to(self.base_dir.resolve())
        except ValueError:
            print(f"Refusing to delete {repo_path}: not inside configured base_dir {self.base_dir}")
            return

        print(f"Cleaning up repository directory at {repo_path}...")
        def remove_readonly(func, path, excinfo):
            import stat
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except Exception as e:
                print(f"Failed to remove {path}: {e}")

        shutil.rmtree(repo_path, onerror=remove_readonly)

        # Remove parent directory if empty (e.g. tenant_id folder)
        parent = repo_path.parent
        if parent != self.base_dir and parent.exists():
            try:
                if not any(parent.iterdir()):
                    parent.rmdir()
            except Exception:
                pass

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

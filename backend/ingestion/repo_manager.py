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

    def _normalize_url(self, url: str, token: str = None) -> tuple[str, str]:
        """Validates and normalizes the URL. Returns (repo_name, clone_url)."""
        clean_url = url.strip().rstrip("/")
        
        if not clean_url:
            raise ValueError("Invalid URL: Cannot be empty")
            
        if not clean_url.startswith(("http://", "https://", "git@")):
            raise ValueError("Invalid URL: Must start with http://, https://, or git@")
            
        if not clean_url.endswith(".git"):
            clean_url += ".git"
            
        repo_name = clean_url.split("/")[-1].replace(".git", "")
        
        clone_url = clean_url
        if token:
            if clone_url.startswith("https://"):
                clone_url = f"https://{token}@{clone_url[8:]}"
            elif clone_url.startswith("http://"):
                clone_url = f"http://{token}@{clone_url[7:]}"
                
        return repo_name, clone_url

    def clone_remote_repo(self, url: str, token: str = None, tenant_id: str = None, branch: str = None) -> Path:
        """Clones a remote repository into the designated directory. Supports tenant isolation, auth token, and specific branch."""
        repo_name, clone_url = self._normalize_url(url, token)
        
        if tenant_id:
            dest_dir = self.base_dir / tenant_id / repo_name
        else:
            dest_dir = self.base_dir / repo_name
        
        if dest_dir.exists():
            print(f"Repo already exists at {dest_dir}, cleaning up before re-cloning...")
            self.cleanup_repo(dest_dir)
            
        dest_dir.parent.mkdir(parents=True, exist_ok=True)
        print(f"Cloning {url} into {dest_dir}...")

        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        
        cmd = ["git", "clone", "--depth", "1"]
        if branch:
            cmd.extend(["-b", branch])
        cmd.extend([clone_url, str(dest_dir)])
        
        subprocess.run(
            cmd, 
            check=True,
            capture_output=True,
            env=env
        )
        return dest_dir

    def get_remote_branches(self, url: str, token: str = None) -> list[str]:
        """Fetches a list of available remote branches using git ls-remote."""
        _, clone_url = self._normalize_url(url, token)

        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        
        try:
            result = subprocess.run(
                ["git", "ls-remote", "--heads", clone_url], 
                check=True,
                capture_output=True,
                text=True,
                env=env
            )
            branches = []
            for line in result.stdout.strip().split("\n"):
                if line:
                    parts = line.split("refs/heads/")
                    if len(parts) > 1:
                        branches.append(parts[-1].strip())
            return branches
        except subprocess.CalledProcessError as e:
            raise ValueError(f"Failed to fetch branches: {e.stderr}")

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

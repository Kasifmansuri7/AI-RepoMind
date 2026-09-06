from pathlib import Path
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjs
import tree_sitter_typescript as ttts
import tree_sitter_jsx as tsjsx
import tree_sitter_tsx as tstsx
from tree_sitter import Language, Parser

def get_parser(extension: str) -> Parser | None:
    try:
        if extension == ".py":
            return Parser(Language(tspython.language()))
        elif extension in [".js"]:
            return Parser(Language(tsjs.language()))
        elif extension in [".ts"]:
            return Parser(Language(ttts.language()))
        elif extension in [".jsx"]:
            return Parser(Language(tsjsx.language()))
        elif extension in [".tsx"]:
            return Parser(Language(tstsx.language()))
        return None
    except Exception as e:
        print(f"Failed to load parser for {extension}: {e}")
        return None

def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200, extension: str = None) -> list[str]:
    """A smarter fallback chunker for files using LangChain."""
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
        
        lang_mapping = {
            ".py": Language.PYTHON,
            ".js": Language.JS,
            ".ts": Language.TS,
            ".tsx": Language.TS,
            ".java": Language.JAVA,
            ".cpp": Language.CPP,
            ".c": Language.CPP,
            ".go": Language.GO,
            ".rs": Language.RUST,
            ".php": Language.PHP,
            ".html": Language.HTML,
            ".rb": Language.RUBY,
        }
        
        if extension and extension in lang_mapping:
            splitter = RecursiveCharacterTextSplitter.from_language(
                language=lang_mapping[extension],
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
        else:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                length_function=len,
            )
        return splitter.split_text(text)
    except ImportError:
        # Fallback to naive if langchain-text-splitters is not installed
        lines = text.split("\n")
        chunks = []
        current_chunk = []
        
        for line in lines:
            current_chunk.append(line)
            if len(current_chunk) >= 50:
                chunks.append("\n".join(current_chunk))
                current_chunk = []
                
        if current_chunk:
            chunks.append("\n".join(current_chunk))
            
        return chunks

class CodeChunker:
    def __init__(self):
        # Interesting node types we want to extract as individual chunks
        self.target_node_types = {
            ".py": ["function_definition", "class_definition"],
            ".js": ["function_declaration", "class_declaration", "method_definition", "arrow_function", "variable_declarator"],
            ".ts": ["function_declaration", "class_declaration", "method_definition", "arrow_function", "variable_declarator"],
            ".jsx": ["function_declaration", "class_declaration", "method_definition", "arrow_function", "variable_declarator"],
            ".tsx": ["function_declaration", "class_declaration", "method_definition", "arrow_function", "variable_declarator"],
        }
        
    def _extract_ast_chunks(self, root_node, source_code: bytes, target_types: list[str]) -> list[str]:
        """Recursively extract nodes of target types."""
        chunks = []
        
        def traverse(node):
            if node.type in target_types:
                # If it's a variable_declarator but not an arrow function, we might want to skip it,
                # but tree-sitter JS parses `const foo = () => {}` as a variable_declarator.
                chunks.append(node.text.decode("utf-8", errors="ignore"))
                # We can also traverse children if we want nested functions/methods as separate chunks
                for child in node.children:
                    traverse(child)
            else:
                for child in node.children:
                    traverse(child)
                    
        traverse(root_node)
        return chunks

    def chunk_file(self, file_path: Path) -> list[dict]:
        """Reads a file and returns a list of chunks with metadata."""
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            return []
            
        ext = file_path.suffix.lower()
        parser = get_parser(ext)
        
        raw_chunks = []
        
        if parser and ext in self.target_node_types:
            try:
                tree = parser.parse(content.encode("utf-8", errors="ignore"))
                ast_chunks = self._extract_ast_chunks(
                    tree.root_node, 
                    content.encode("utf-8", errors="ignore"), 
                    self.target_node_types[ext]
                )
                if ast_chunks:
                    # Deduplicate in case we grabbed both a class and its methods, 
                    # we keep both but just ensuring no exact duplicates.
                    # Wait, if we keep nested, it might pollute with too much duplicate text. 
                    # For now, keeping them separate is good for retrieval.
                    raw_chunks = list(dict.fromkeys(ast_chunks)) 
                else:
                    raw_chunks = chunk_text(content, extension=ext)
            except Exception as e:
                print(f"AST parsing failed for {file_path}: {e}")
                raw_chunks = chunk_text(content, extension=ext)
        else:
            raw_chunks = chunk_text(content, extension=ext)
        
        chunks = []
        for i, chunk_text_content in enumerate(raw_chunks):
            if chunk_text_content.strip():
                chunks.append({
                    "file_path": str(file_path),
                    "chunk_index": i,
                    "content": f"File: {file_path.name}\n\n{chunk_text_content}",
                })
            
        return chunks

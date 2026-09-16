import re
import requests
import base64
import mimetypes

def url_to_base64(url: str) -> str:
    if url.startswith("data:"):
        return url
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        content_type = response.headers.get("Content-Type", "")
        if not content_type or not content_type.startswith("image/"):
            content_type, _ = mimetypes.guess_type(url.split("?")[0])
            content_type = content_type or "image/jpeg"
            
        encoded = base64.b64encode(response.content).decode("utf-8")
        return f"data:{content_type};base64,{encoded}"
    except Exception as e:
        print(f"Failed to fetch image {url}: {e}")
        # Fallback to the original URL
        return url

def parse_multimodal_content(text: str) -> list | str:
    """
    Looks for standard Markdown image syntax ![...](http...) or ![...](data:image...)
    and splits the text into a list of text and image parts for LangChain's HumanMessage.
    If no images are found, returns the raw text string.
    """
    # Pattern matches ![alt text](url) where url is an http/https link or data URI
    pattern = r"!\[.*?\]\((https?://[^\s)]+|data:image/[^;]+;base64,[a-zA-Z0-9+/=]+)\)"
    parts = []
    
    last_idx = 0
    for match in re.finditer(pattern, text):
        # Add text before the image
        if match.start() > last_idx:
            text_part = text[last_idx:match.start()].strip()
            if text_part:
                parts.append({"type": "text", "text": text_part})
            
        # Add the image URL, converting HTTP to base64 if needed
        img_url = match.group(1)
        if img_url.startswith("http"):
            img_url = url_to_base64(img_url)
            
        parts.append({
            "type": "image_url",
            "image_url": {"url": img_url}
        })
        
        last_idx = match.end()
        
    # Add remaining text
    if last_idx < len(text):
        remaining_text = text[last_idx:].strip()
        if remaining_text:
            parts.append({"type": "text", "text": remaining_text})
            
    # If no images found, just return the raw string
    if not parts:
        return text
        
    return parts


import os
import re

base64_path = r'c:\modifica crm rise\logo_base64_utf8.txt'
html_path = r'c:\Users\marco\landing islanda.html'

if not os.path.exists(base64_path):
    print("Base64 file not found")
    exit(1)

with open(base64_path, 'r') as f:
    base64_data = f.read().strip()

print(f"Base64 data length: {len(base64_data)}")

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Define the new header HTML
new_header_html = f'''    <header class="main-header">
        <div class="header-logo">
            <img src="data:image/jpeg;base64,{base64_data}" alt="Rise Program Logo">
        </div>
        <div class="header-badge">
            <svg class="header-lock-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V7zm3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
            </svg>
            <div class="header-text">ACCESSO RISERVATO AI NETWORKER</div>
        </div>
    </header>'''

# Regex to find existing header
header_pattern = re.compile(r'<header class="main-header">.*?</header>', re.DOTALL)

if header_pattern.search(content):
    print("Found existing header, replacing...")
    new_content = header_pattern.sub(new_header_html, content)
else:
    print("Header not found, injecting after body tag...")
    # Inject after <body> tag (handling attributes)
    body_pattern = re.compile(r'(<body[^>]*>)', re.IGNORECASE)
    if body_pattern.search(content):
        new_content = body_pattern.sub(r'\1\n' + new_header_html, content)
    else:
        print("Body tag not found!")
        exit(1)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully updated header.")

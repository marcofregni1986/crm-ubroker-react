
import os
import re

html_path = r'c:\Users\marco\landing islanda.html'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Premium Header CSS
css_styles = """
    /* --- NEW PREMIUM HEADER FIXED --- */
    .main-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 12px 32px !important;
        background: rgba(7, 11, 20, 0.95) !important;
        backdrop-filter: blur(15px) !important;
        border-bottom: 2px solid rgba(226, 160, 63, 0.2) !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 1000 !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }

    .header-logo img {
        height: 48px !important;
        width: auto !important;
        display: block !important;
        filter: drop-shadow(0 0 8px rgba(226, 160, 63, 0.3)) !important;
    }

    .header-badge {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 8px 16px !important;
        background: rgba(255, 255, 255, 0.05) !important;
        border: 1px solid rgba(226, 160, 63, 0.5) !important;
        border-radius: 100px !important;
        box-shadow: 0 0 15px rgba(226, 160, 63, 0.1) !important;
    }

    .header-lock-icon {
        color: #e2a03f !important;
        width: 14px !important;
        height: 14px !important;
    }

    .header-text {
        font-size: 10px !important;
        font-weight: 800 !important;
        letter-spacing: 0.12em !important;
        text-transform: uppercase !important;
        color: #fff8db !important;
        text-shadow: 0 0 8px rgba(226, 160, 63, 0.4) !important;
    }

    @media (max-width: 640px) {
        .main-header {
            padding: 10px 16px !important;
        }
        .header-logo img {
            height: 38px !important;
        }
        .header-badge {
            padding: 6px 12px !important;
        }
        .header-text {
            font-size: 8px !important;
        }
    }
"""

# Remove old CSS if present
content = re.sub(r'/\* --- NEW HEADER --- \*/.*?@media \(max-width: 640px\) \{.*?\}', '', content, flags=re.DOTALL)
content = re.sub(r'/\* --- NEW PREMIUM HEADER --- \*/.*?@media \(max-width: 640px\) \{.*?\}', '', content, flags=re.DOTALL)

# Inject new CSS before closing style tag
if '</style>' in content:
    new_content = content.replace('</style>', css_styles + '\n</style>')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully injected CSS styles.")
else:
    print("Style tag not found!")
    exit(1)

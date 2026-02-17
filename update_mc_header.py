import re
import os

# Define paths using raw strings to handle backslashes correctly
landing_path = r'c:\Users\marco\landing islanda.html'
masterclass_path = r'c:\Users\marco\masterclasspage.html'

def update_header():
    print(f"Starting header update...")
    print(f"Reading from: {landing_path}")
    print(f"Writing to: {masterclass_path}")
    
    # 1. Read Landing Page
    if not os.path.exists(landing_path):
        print(f"Error: {landing_path} not found.")
        return
        
    with open(landing_path, 'r', encoding='utf-8') as f:
        landing_content = f.read()

    # Extract new header HTML
    # Looking for <header class="fixed-header"> ... </header>
    header_match = re.search(r'(<header class="fixed-header">.*?</header>)', landing_content, re.DOTALL)
    if not header_match:
        print("Error: Could not find <header class='fixed-header'> in landing page.")
        return
    new_header_html = header_match.group(1)
    print("Found new header HTML length:", len(new_header_html))

    # 2. Read Masterclass Page
    if not os.path.exists(masterclass_path):
        print(f"Error: {masterclass_path} not found.")
        return

    with open(masterclass_path, 'r', encoding='utf-8') as f:
        mc_content = f.read()

    # 3. Replace HTML
    # Old header is <div class="rp-nav-fixed"> ... </div>
    # We match until the closing div. 
    old_header_pattern = r'(<div class="rp-nav-fixed">\s*<img[^>]+>\s*</div>)'
    
    if re.search(old_header_pattern, mc_content, re.DOTALL):
        mc_content = re.sub(old_header_pattern, new_header_html, mc_content, count=1, flags=re.DOTALL)
        print("Replaced HTML header block.")
    else:
        print("Warning: Could not find old <div class='rp-nav-fixed'> block. Checking if already updated...")
        if "fixed-header" not in mc_content:
             print("Could not find old header to replace and new header is not present.")

    # 4. Replace/Update CSS
    # We want to replace the "Fixed Nav" section with new styles.
    # From: /* ===== Fixed Nav ===== */
    # To:   /* ===== Header ===== */
    
    # New CSS content
    new_css = """    /* ===== Fixed Nav (Updated) ===== */
        body {
            padding-top: 60px; /* Spazio per l'header fisso */
        }

        .fixed-header {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 72px; /* Increased height */
            background-color: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            padding: 0 24px;
            z-index: 1000;
        }

        .fixed-header img {
            height: 48px;
            width: auto;
            object-fit: contain;
            mix-blend-mode: screen;
        }

        .header-tagline {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-left: auto;
            margin-right: 20px;
            padding: 8px 16px;
            border: 1px solid rgba(245, 158, 11, 0.8);
            border-radius: 50px;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            letter-spacing: 0.03em;
            font-weight: 500;
            line-height: 1.2;
        }

        .header-tagline svg {
            width: 14px;
            height: 14px;
            fill: rgba(245, 158, 11, 0.8);
        }

        /* Mobile Adjustments */
        @media (max-width: 500px) {
            .fixed-header img {
                height: 36px;
            }
            .header-tagline {
                font-size: 12px;
                padding: 6px 12px;
            }
        }

    """
    
    # Regex to find the block between "Fixed Nav" and "Header" comments
    # Look for: /* ===== Fixed Nav ===== */ ... (content) ... /* ===== Header ===== */
    css_pattern = r'(/\*\s*=====\s*Fixed Nav\s*=====\s*\*/.*?)(/\*\s*=====\s*Header\s*=====\s*\*/)'
    
    match = re.search(css_pattern, mc_content, re.DOTALL)
    if match:
        # Replacement: New CSS + The Header comment (group 2)
        mc_content = re.sub(css_pattern, new_css + r'\2', mc_content, count=1, flags=re.DOTALL)
        print("Replaced CSS block.")
    else:
        print("Warning: Could not find old CSS block '/* ===== Fixed Nav ===== */' to replace.")

    # 5. Write back
    with open(masterclass_path, 'w', encoding='utf-8') as f:
        f.write(mc_content)
    print("Successfully updated masterclasspage.html")

if __name__ == "__main__":
    update_header()

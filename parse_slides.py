import json
import re

def parse_extracted_content(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    slides = []
    # Split by Slide [Number]:
    raw_slides = re.split(r'Slide \d+:', content)
    
    # First split is usually the header "Extraction from..."
    for raw in raw_slides[1:]:
        lines = raw.strip().split('\n')
        slide_data = {
            "title": "",
            "text_blocks": [],
            "tables": []
        }
        
        for line in lines:
            line = line.strip()
            if line.startswith('TITLE:'):
                slide_data["title"] = line.replace('TITLE:', '').strip()
            elif line.startswith('TEXT:'):
                txt = line.replace('TEXT:', '').strip()
                if txt:
                    # Clean up some common artifacts
                    txt = txt.replace('Þ', 'è').replace('Ó', 'à').replace('ò', '·').replace('Æ', '’').replace('░', 'ª').replace('└', 'À')
                    slide_data["text_blocks"].append(txt)
            elif line.startswith('TABLE:'):
                slide_data["tables"].append(line.replace('TABLE:', '').strip())
            elif line and not any(line.startswith(p) for p in ['---', 'Total slides:']):
                # Catch-all for lines that might have lost their prefix but are text
                # Re-clean encoding artifacts
                line = line.replace('Þ', 'è').replace('Ó', 'à').replace('ò', '·').replace('Æ', '’').replace('░', 'ª').replace('└', 'À')
                slide_data["text_blocks"].append(line)
        
        # Determine best type for the slide
        if not slide_data["title"] and slide_data["text_blocks"]:
            # If there's only one or two short lines, it might be a title slide
            if len(slide_data["text_blocks"]) == 1 or (len(slide_data["text_blocks"]) == 2 and len(slide_data["text_blocks"][0]) < 30):
                slide_data["type"] = "title"
                slide_data["title"] = slide_data["text_blocks"][0]
                slide_data["subtitle"] = slide_data["text_blocks"][1] if len(slide_data["text_blocks"]) > 1 else ""
                slide_data["text_blocks"] = []
            else:
                slide_data["type"] = "content"
        elif slide_data["title"]:
            slide_data["type"] = "content"
        else:
            slide_data["type"] = "empty" # For blank slides
            
        slides.append(slide_data)
        
    return slides

if __name__ == "__main__":
    input_file = r'c:\modifica crm rise\extracted_content_utf8.txt'
    output_file = r'c:\modifica crm rise\slides_full.json'
    
    parsed_slides = parse_extracted_content(input_file)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(parsed_slides, f, indent=4, ensure_ascii=False)
    
    print(f"Successfully parsed {len(parsed_slides)} slides into {output_file}")

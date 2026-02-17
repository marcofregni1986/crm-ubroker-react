import json

def convert_to_js():
    try:
        with open('slides_full.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        with open('slides_data.js', 'w', encoding='utf-8') as f:
            f.write('const SLIDES_DATA = ')
            json.dump(data, f, indent=4, ensure_ascii=False)
            f.write(';')
            
        print("Successfully created slides_data.js")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    convert_to_js()

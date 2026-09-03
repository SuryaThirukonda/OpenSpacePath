import pypdf, sys

path = r"C:\Users\thiru\AppData\Local\Temp\claude\C--Users-thiru-tamu2-ecs-research-rathinam\5b6188bd-1182-4842-a6a3-cb49230254ab\scratchpad\pdfs\ig-26-004.pdf"
out = r"C:\Users\thiru\AppData\Local\Temp\claude\C--Users-thiru-tamu2-ecs-research-rathinam\5b6188bd-1182-4842-a6a3-cb49230254ab\scratchpad\pdfs\ig-26-004.txt"

reader = pypdf.PdfReader(path)
print(f"num pages: {len(reader.pages)}", file=sys.stderr)
meta = reader.metadata
print(f"metadata: {meta}", file=sys.stderr)

full_text = []
for i, page in enumerate(reader.pages):
    try:
        t = page.extract_text() or ""
    except Exception as e:
        t = f"[ERROR extracting page {i}: {e}]"
    full_text.append(f"\n=== PAGE {i+1} ===\n" + t)

text = "".join(full_text)
with open(out, "w", encoding="utf-8") as f:
    f.write(text)

print(f"total chars extracted: {len(text)}", file=sys.stderr)
print(f"written to {out}", file=sys.stderr)

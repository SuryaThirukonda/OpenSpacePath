"""T3.7 helper: strip DocBook XML to plain text; optional regex filter with context.
usage: python T3_7_xml_text.py FILE [regex] [context_lines] [max_lines]"""
import re,sys,html
f=sys.argv[1]; rx=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else None
ctx=int(sys.argv[3]) if len(sys.argv)>3 else 2; mx=int(sys.argv[4]) if len(sys.argv)>4 else 400
s=open(f,encoding='utf-8',errors='replace').read()
s=re.sub(r'<!--.*?-->','',s,flags=re.S)
s=re.sub(r'<(title|para|entry|term|listitem|row|section|refsection|varlistentry|literallayout|programlisting)\b[^>]*>','\n',s)
s=re.sub(r'<[^>]+>','',s); s=html.unescape(s)
lines=[re.sub(r'\s+',' ',l).strip() for l in s.split('\n')]
lines=[l for l in lines if l]
if rx:
    keep=set()
    for i,l in enumerate(lines):
        if re.search(rx,l,re.I):
            for j in range(max(0,i-ctx),min(len(lines),i+ctx+1)): keep.add(j)
    out=[lines[i] for i in sorted(keep)]
else: out=lines
print('\n'.join(out[:mx]))
if len(out)>mx: print(f'... [{len(out)-mx} more lines]')

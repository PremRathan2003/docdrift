import json, re, urllib.request, sys, time

def api(path):
    req = urllib.request.Request('https://api.github.com' + path,
        headers={'Accept':'application/vnd.github+json','User-Agent':'docdrift-candidates'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

DOC = re.compile(r'\.(md|mdx|rst)$', re.I)
CHANGELOG = re.compile(r'(^|/)(changelog|history|changes|news|release)', re.I)
CODE = re.compile(r'\.(js|ts|mjs|cjs|py|rs|go|java)$', re.I)
TEST = re.compile(r'(^|/)(test|tests|spec|__tests__)/', re.I)

def candidates(repo, docdir, limit=25):
    out = []
    seen = set()
    commits = api(f'/repos/{repo}/commits?path={docdir}&per_page={limit}')
    for c in commits:
        m = re.search(r'\(#(\d+)\)', c['commit']['message'].split('\n')[0])
        if not m: continue
        n = int(m.group(1))
        if n in seen: continue
        seen.add(n)
        try:
            files = api(f'/repos/{repo}/pulls/{n}/files?per_page=100')
        except Exception as e:
            continue
        if len(files) > 45: continue
        docs = [f for f in files if DOC.search(f['filename']) and not CHANGELOG.search(f['filename'])
                and f['status'] == 'modified']
        code = [f for f in files if CODE.search(f['filename']) and not TEST.search(f['filename'])]
        if not docs or not code: continue
        doc_churn = sum(f['additions'] + f['deletions'] for f in docs)
        if doc_churn < 4: continue
        out.append({
            'repo': repo, 'pr': n,
            'title': c['commit']['message'].split('\n')[0][:70],
            'files': len(files), 'docs': [f['filename'] for f in docs][:4],
            'doc_churn': doc_churn, 'code': len(code),
        })
    return out

for repo, docdir in json.loads(sys.argv[1]):
    try:
        for c in candidates(repo, docdir):
            print(f"{c['repo']:26} #{c['pr']:<6} files={c['files']:<3} codefiles={c['code']:<3} churn={c['doc_churn']:<4} {c['title']}")
            print(f"{'':26}   docs: {', '.join(c['docs'])}")
    except Exception as e:
        print(f"{repo}: {e}")

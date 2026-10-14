"""One-off source artifact projection. No source snippets, secrets or review decisions."""
import hashlib
import json
import os
from pathlib import Path

root = Path(os.environ['WINGA_BASELINE_SARIF'])
reports = list(root.rglob('*.sarif'))
assert len(reports) == 1, 'Exactly one baseline report is required'
assert 0 < reports[0].stat().st_size <= 32 * 1024 * 1024, 'Report size rejected'
raw = reports[0].read_bytes()
assert 0 < len(raw) <= 32 * 1024 * 1024, 'Report size rejected'
report = json.loads(raw)
assert report.get('version') == '2.1.0' and len(report.get('runs', [])) == 1
run = report['runs'][0]
results = run.get('results', [])
assert len(results) == 55, 'Baseline finding count changed'
artifacts = run.get('artifacts', [])

def location(value):
    physical = value.get('physicalLocation', {})
    artifact = physical.get('artifactLocation', {})
    index = artifact.get('index')
    uri = artifact.get('uri')
    if not uri and isinstance(index, int) and 0 <= index < len(artifacts):
        uri = artifacts[index].get('location', {}).get('uri')
    region = physical.get('region', {})
    return {'path': uri, 'artifactIndex': index, 'startLine': region.get('startLine'),
            'endLine': region.get('endLine'), 'startColumn': region.get('startColumn'),
            'message': value.get('message', {}).get('text', '')[:4096]}

print(json.dumps({'mode': 'winga-codeql-baseline-report',
    'sourceCommit': 'a6fb17587f9883ec5f910d38b53338d16f5dd5cd',
    'artifactId': 11903020316, 'reportSha256': hashlib.sha256(raw).hexdigest(),
    'findings': len(results), 'artifactCount': len(artifacts),
    'independentReviewAccepted': False}))
for index, result in enumerate(results):
    flows = []
    truncated = False
    for flow in result.get('codeFlows', []):
        for thread in flow.get('threadFlows', []):
            nodes = thread.get('locations', [])
            truncated |= len(nodes) > 128
            flows.append([location(node.get('location', {})) for node in nodes[:128]])
    print(json.dumps({'mode': 'winga-codeql-baseline-finding', 'index': index,
        'ruleId': result.get('ruleId'), 'level': result.get('level'),
        'message': result.get('message', {}).get('text', '')[:8192],
        'locations': [location(value) for value in result.get('locations', [])],
        'relatedLocations': [dict(location(value), id=value.get('id')) for value in result.get('relatedLocations', [])],
        'codeFlows': flows, 'truncated': truncated}, separators=(',', ':')))

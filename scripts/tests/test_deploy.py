"""Exercise deployment ordering and flags with a fake gcloud; never call Google Cloud."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'deploy-cloud-run.sh'

class DeploymentContract(unittest.TestCase):
    def invoke(self, fail_migration=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        fake = root / 'gcloud'
        fake.write_text('''#!/usr/bin/env python3
import json,os,sys
with open(os.environ['CALL_LOG'], 'a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[1:4] == ['run','jobs','execute'] and os.environ.get('FAIL_MIGRATION') == '1':sys.exit(1)
if sys.argv[1:4] == ['run','services','describe']:print('https://backend.example.run.app')
''')
        fake.chmod(0o755)
        log = root / 'calls.jsonl'
        env = {**os.environ, 'PATH': str(root)+os.pathsep+os.environ['PATH'],
               'CALL_LOG': str(log), 'IMAGE_TAG': 'tested-build-id',
               'CLOUD_SQL_CONNECTION_NAME': 'lexical-lock-472810-g9:europe-west1:notesapp-db',
               'DATABASE_SECRET_VERSION': '1', 'FAIL_MIGRATION': '1' if fail_migration else '0'}
        result = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True, text=True)
        import json
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        return result, calls

    def test_migration_precedes_private_service_deployments(self):
        result, calls = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[0][:3], ['run','jobs','deploy'])
        self.assertEqual(calls[1][:3], ['run','jobs','execute'])
        deploys = [call for call in calls if call[:2] == ['run','deploy']]
        self.assertEqual(len(deploys), 2)
        for call in deploys:
            self.assertIn('--no-allow-unauthenticated', call)
            self.assertIn('--invoker-iam-check', call)
            self.assertNotIn('--allow-unauthenticated', call)
        self.assertIn('--args=--migrate-only', calls[0])
        self.assertTrue(any('DATABASE_PASSWORD=notesapp-db-password:1' in arg for arg in calls[0]))
        self.assertTrue(any('BACKEND_URL=https://backend.example.run.app' in arg for arg in deploys[1]))
        grant = next(call for call in calls if call[:3] == ['run','services','add-iam-policy-binding'])
        self.assertIn('roles/run.invoker', grant)
        self.assertTrue(any(arg.startswith('serviceAccount:notesapp-frontend@') for arg in grant))

    def test_failed_migration_prevents_service_rollout(self):
        result, calls = self.invoke(fail_migration=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[:2] == ['run','deploy'] for call in calls))

if __name__ == '__main__': unittest.main()

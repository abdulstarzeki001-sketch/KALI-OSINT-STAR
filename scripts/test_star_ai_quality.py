import unittest
from unittest.mock import patch
from scripts.star_ai_quality import audit, benchmark

class QualityTests(unittest.TestCase):
    def test_bad_config(self):
        source = 'from pydantic import BaseSettings, validator\nimport os\nSECRET_KEY = os.getenv("SECRET_KEY", "unsafe")'
        self.assertEqual({x["rule"] for x in audit(source)}, {"PYDANTIC_V1_API", "SECRET_LITERAL_FALLBACK"})
    def test_sync_database(self):
        self.assertEqual(audit("from sqlalchemy import create_engine as ce\nce('sqlite:///x')")[0]["rule"], "SYNC_DB_API_IN_ASYNC_PROFILE")
    def test_jose(self):
        self.assertEqual(audit("from jose import jwt\njwt.decode(token, key, options={'require':['exp']})")[0]["rule"], "JOSE_WRONG_REQUIRED_CLAIMS_OPTION")
    def test_safe(self):
        self.assertEqual(audit("from pydantic_settings import BaseSettings\nfrom sqlalchemy.ext.asyncio import create_async_engine\nengine = create_async_engine(url)"), [])
    def test_syntax(self):
        self.assertEqual(audit("def broken(")[0]["rule"], "PYTHON_SYNTAX")
    def test_literal(self):
        self.assertEqual(audit("SECRET_KEY = 'unsafe'")[0]["rule"], "SECRET_LITERAL_DEFAULT")
    @patch("scripts.star_ai_quality.generate")
    def test_distinct_reviewer(self, gen):
        with self.assertRaises(ValueError):
            benchmark("same", "same")
        gen.assert_not_called()
    @patch("scripts.star_ai_quality.generate")
    def test_benchmark_mock(self, gen):
        gen.side_effect = [{"response": "def add(a,b):\n    return a+b", "model": "coder"}, {"response": "OK", "model": "reviewer"}]
        result = benchmark("coder", "reviewer")
        self.assertEqual(result["static_findings"], [])
        self.assertFalse(result["executed_generated_code"])
        self.assertEqual(result["independent_review"]["model"], "reviewer")
        self.assertEqual(gen.call_count, 2)

if __name__ == "__main__":
    unittest.main()

import io
import json
import unittest
from unittest.mock import patch, MagicMock
from scripts.gpu_snapshot import installed_models

class InventoryTests(unittest.TestCase):
    @patch("scripts.gpu_snapshot.urllib.request.build_opener")
    def test_inventory(self, opener):
        response=MagicMock()
        response.__enter__.return_value=io.BytesIO(json.dumps({"models":[{"name":"synthetic:1b","size":1000,"details":{"parameter_size":"1B","quantization_level":"Q4_K_M"},"digest":"drop"}]}).encode())
        opener.return_value.open.return_value=response
        result=installed_models()
        self.assertEqual(result,[{"name":"synthetic:1b","sizeBytes":1000,"parameterSize":"1B","quantization":"Q4_K_M"}])
        opener.return_value.open.assert_called_once_with("http://127.0.0.1:11434/api/tags",timeout=5)
    @patch("scripts.gpu_snapshot.urllib.request.build_opener",side_effect=OSError())
    def test_unavailable(self, opener):
        self.assertIsNone(installed_models())

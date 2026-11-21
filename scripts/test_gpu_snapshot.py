import unittest
from unittest.mock import patch
from subprocess import CompletedProcess
from scripts.gpu_snapshot import gpu_snapshot, loaded_models, snapshot
class GpuSnapshotTests(unittest.TestCase):
    @patch("scripts.gpu_snapshot.subprocess.run", return_value=CompletedProcess([],0,"0, Synthetic GPU, 42, 8000, 16000, 60\n",""))
    def test_gpu_counters(self, run):
        result=gpu_snapshot()
        self.assertEqual(result[0]["usedMiB"],8000)
        self.assertEqual(result[0]["utilization"],42)
        self.assertEqual(run.call_args.kwargs["timeout"],8)
    @patch("scripts.gpu_snapshot.subprocess.run",side_effect=FileNotFoundError())
    def test_gpu_unavailable(self,run):
        self.assertIsNone(gpu_snapshot())
    @patch("scripts.gpu_snapshot.urllib.request.build_opener",side_effect=OSError())
    def test_ollama_unavailable(self,opener):
        self.assertIsNone(loaded_models())
    @patch("scripts.gpu_snapshot.gpu_snapshot",return_value=None)
    @patch("scripts.gpu_snapshot.loaded_models",return_value=None)
    def test_no_inference_or_cost_claim(self,models,gpu):
        result=snapshot()
        self.assertIsNone(result["tokensPerSecond"])
        self.assertIsNone(result["actualCost"])
        self.assertEqual(result["schema"],1)

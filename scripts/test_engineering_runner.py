import subprocess
import unittest
from unittest.mock import patch
from scripts.engineering_runner import run_suite, build_report, metadata

class RunnerTests(unittest.TestCase):
    @patch("scripts.engineering_runner.subprocess.run")
    def test_exit_codes(self, run):
        run.return_value = subprocess.CompletedProcess(["fixed"], 0)
        self.assertEqual(run_suite("x", ["fixed"])["status"], "passed")
        self.assertFalse(run.call_args.kwargs["shell"])
        run.return_value = subprocess.CompletedProcess(["fixed"], 2)
        self.assertEqual(run_suite("x", ["fixed"])["status"], "failed")

    @patch("scripts.engineering_runner.subprocess.run", side_effect=subprocess.TimeoutExpired(["fixed"], 90))
    def test_timeout(self, run):
        self.assertEqual(run_suite("x", ["fixed"])["status"], "timeout")

    @patch("scripts.engineering_runner.subprocess.run", side_effect=FileNotFoundError())
    def test_unavailable(self, run):
        self.assertIsNone(run_suite("x", ["fixed"])["exitCode"])

    @patch("scripts.engineering_runner.run_suite")
    def test_report_fails_closed(self, run):
        run.side_effect=[{"status":"passed"},{"status":"failed"},{"status":"passed"}]
        self.assertFalse(build_report()["passed"])

    @patch.dict("os.environ", {"GITHUB_ACTIONS":"true","GITHUB_SHA":"a"*40,"GITHUB_RUN_ID":"123","GITHUB_REPOSITORY":"other/repo"}, clear=True)
    def test_wrong_repository_is_local(self):
        self.assertEqual(metadata()["origin"], "local")

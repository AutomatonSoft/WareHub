import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]


class AftercoolRuntimeTests(unittest.TestCase):
    def test_stage_and_prod_pass_mapping_env_to_api_and_worker(self):
        for environment, prefix in (("stage", "STAGE"), ("prod", "PROD")):
            with self.subTest(environment=environment), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                source = ROOT / "infra" / "deploy" / environment
                shutil.copy(source / "docker-compose.yml", directory / "docker-compose.yml")
                shutil.copy(source / f"env.{environment}.sanitized.template", directory / ".env")
                with (directory / ".env").open("a") as stream:
                    stream.write(f"\n{prefix}_MONGO_USER=test-user\n{prefix}_MONGO_PASSWORD=test-password\n"
                                 "AFTERCOOL_USERNAME=test-login\nAFTERCOOL_PASSWORD=test-aftercool-password\n")
                result = subprocess.run(["docker", "compose", "--env-file", ".env", "-f",
                                         "docker-compose.yml", "config", "--format", "json"],
                                        cwd=directory, capture_output=True, text=True, check=True)
                config = json.loads(result.stdout)
                for name in ("services", "aftercool_mapping_worker"):
                    values = config["services"][name]["environment"]
                    self.assertEqual(values["AFTERCOOL_USERNAME"], "test-login")
                    self.assertEqual(values["AFTERCOOL_PASSWORD"], "test-aftercool-password")
                    self.assertEqual(values["JV_XL_MAPPING_MONGO_DATABASE"], f"warehub_jv_xl_mapping_{environment}")
                    self.assertEqual(values["JV_XL_MAPPING_MONGO_USERNAME"], "test-user")
                    self.assertEqual(values["JV_XL_MAPPING_MONGO_PASSWORD"], "test-password")
                    self.assertEqual(values["JV_XL_MAPPING_MONGO_URI"], "mongodb://mongodb:27017/?authSource=admin")
                self.assertEqual(config["services"]["aftercool_mapping_worker"]["command"],
                                 ["python", "manage.py", "run_gallery_mapping_worker"])
                workflow = (ROOT / ".github" / "workflows" / f"{environment}-deploy.yml").read_text()
                self.assertIn("secrets.AFTERCOOL_USERNAME", workflow)
                self.assertIn("secrets.AFTERCOOL_PASSWORD", workflow)
                self.assertIn("wait_health aftercool_mapping_worker healthy", workflow)
                starts = [line for line in workflow.splitlines() if "up -d" in line and "services " in line]
                self.assertTrue(any("aftercool_mapping_worker" in line for line in starts))


if __name__ == "__main__":
    unittest.main()

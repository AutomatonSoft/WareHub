import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]


class XLMultisiteRuntimeTests(unittest.TestCase):
    def test_stage_and_prod_merge_xl_secret_and_pass_values_to_services(self):
        values = {}
        for site in ("CH", "AT"):
            for suffix in ("HOST", "USER", "PASSWORD", "NAME"):
                values[f"XL_SOURCE_XLMOEBEL_{site}_DB_{suffix}"] = f"test-{site}-{suffix}!$literal#"
            for suffix in ("HOST", "USER", "PASSWORD"):
                values[f"XLMOEBEL_{site}_FTP_{suffix}"] = f"test-{site}-{suffix}!$literal#"
        block = "\n".join(f"{key}='{value}'" for key, value in values.items())
        for environment, prefix in (("stage", "STAGE"), ("prod", "PROD")):
            with self.subTest(environment=environment), tempfile.TemporaryDirectory() as temporary:
                workflow = (ROOT / ".github" / "workflows" / f"{environment}-deploy.yml").read_text()
                self.assertIn("XL_MULTISITE_ENV_FILE_SECRET: ${{ secrets.XL_MULTISITE_ENV_FILE }}", workflow)
                full_env_line = f'printf \'%s\\n\' "${{{prefix}_ENV_FILE_SECRET:-}}"'
                xl_line = 'printf \'%s\\n\' "${XL_MULTISITE_ENV_FILE_SECRET:-}"'
                self.assertLess(workflow.index(full_env_line), workflow.index(xl_line))
                directory = Path(temporary)
                source = ROOT / "infra" / "deploy" / environment
                shutil.copy(source / "docker-compose.yml", directory / "docker-compose.yml")
                override = directory / "override.env"
                override.write_text("UNRELATED_SETTING=preserved\nXL_SOURCE_XLMOEBEL_CH_DB_HOST=old\n" + block + "\n")
                output = directory / ".env"
                subprocess.run([sys.executable, str(ROOT / "infra/scripts/build-runtime-env.py"),
                                "--template", str(source / f"env.{environment}.sanitized.template"),
                                "--override", str(override), "--output", str(output)], check=True)
                self.assertIn("UNRELATED_SETTING=preserved", output.read_text())
                result = subprocess.run(["docker", "compose", "--env-file", ".env", "-f",
                                         "docker-compose.yml", "config", "--format", "json"],
                                        cwd=directory, capture_output=True, text=True, check=True)
                actual = json.loads(result.stdout)["services"]["services"]["environment"]
                for key, value in values.items():
                    self.assertEqual(actual[key].replace("$$", "$"), value)


if __name__ == "__main__":
    unittest.main()

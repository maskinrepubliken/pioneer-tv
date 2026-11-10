"""What the /immich/ proxy lets through (immich.py)."""
import unittest

from pioneertv import immich

A = "4f1c2a9e-1b2c-4d3e-8f90-123456789abc"


class Rules(unittest.TestCase):
    def test_reads(self):
        for path in ("api/albums", f"api/albums/{A}", "api/timeline/buckets", "api/timeline/bucket", "api/people",
                     f"api/people/{A}/thumbnail", "api/memories", f"api/assets/{A}", f"api/assets/{A}/thumbnail",
                     f"api/assets/{A}/video/playback"):
            self.assertEqual(immich.target_url("https://b.se/", path, "size=preview"), f"https://b.se/{path}?size=preview")

    def test_only_the_searches_are_posted(self):
        self.assertIsNotNone(immich.target_url("https://b.se", "api/search/metadata", method="POST"))
        self.assertIsNotNone(immich.target_url("https://b.se", "api/search/smart", method="POST"))
        for path in ("api/albums", f"api/assets/{A}", "api/assets"):
            self.assertIsNone(immich.target_url("https://b.se", path, method="POST"))
        self.assertIsNone(immich.target_url("https://b.se", f"api/assets/{A}", method="DELETE"))

    def test_nothing_else(self):
        for path in ("api/users", "api/api-keys", f"api/assets/{A}/original", "api/shared-links", "photos",
                     f"api/assets/{A}/../../users", "api/assets/%2e%2e/users", "api/albums/x"):
            self.assertIsNone(immich.target_url("https://b.se", path), path)
        self.assertIsNone(immich.target_url("", "api/albums"))

    def test_the_key_in_its_header(self):
        h = immich.request_headers({"Accept": "image/webp", "Cookie": "x", "Range": "bytes=0-"}, "k3y")
        self.assertEqual(h, {"Accept": "image/webp", "Range": "bytes=0-", "x-api-key": "k3y"})


if __name__ == "__main__":
    unittest.main()

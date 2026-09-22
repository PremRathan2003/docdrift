import argparse
import logging

from .sync import sync


def main():
    parser = argparse.ArgumentParser(prog="dirsync")
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--dry-run", action="store_true", help="show what would change")
    parser.add_argument(
        "--log-level", default="info", choices=["debug", "info", "warning"], help="how much to print"
    )
    args = parser.parse_args()
    logging.basicConfig(level=args.log_level.upper())
    sync(args.source, args.target, dry_run=args.dry_run)

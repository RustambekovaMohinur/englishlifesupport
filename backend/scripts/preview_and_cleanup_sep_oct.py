"""
Safe Dry-Run & Targeted Cleanup Tool for September–October LMS Records.

Usage:
  # 1. Preview mode (Dry run, default - no changes made):
  python scripts/preview_and_cleanup_sep_oct.py --dry-run

  # 2. Preview only strictly expired Sep-Oct assignments (deadlines < Nov 1):
  python scripts/preview_and_cleanup_sep_oct.py --mode=expired-only --dry-run

  # 3. Targeted execution ONLY when verified by administrator:
  # python scripts/preview_and_cleanup_sep_oct.py --mode=expired-only --confirm-delete
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def run_preview_and_cleanup(mode: str, confirm_delete: bool):
    print("=" * 80)
    print("       ENGLISH LIFE LMS: SEPTEMBER–OCTOBER RECORDS AUDIT & CLEANUP")
    print("=" * 80)
    print(f"Execution Mode: {'CONFIRMED DELETION' if confirm_delete else 'DRY RUN (Preview Only)'}")
    print(f"Filter Mode:    {mode.upper()}\n")

    async with AsyncSessionLocal() as session:
        # 1. Summary of overall database records
        res_summary = await session.execute(text("""
            SELECT 
                COUNT(*) as total_assignments,
                COUNT(*) FILTER (WHERE deadline < '2026-11-01') as expired_before_nov,
                COUNT(*) FILTER (WHERE created_at >= '2026-09-01' AND created_at < '2026-11-01') as created_in_sep_oct,
                COUNT(*) FILTER (WHERE created_at >= '2026-11-01') as created_in_nov
            FROM assignments;
        """))
        sum_row = res_summary.mappings().first()
        print("DATABASE ASSIGNMENTS OVERVIEW:")
        print(f"  • Total Assignments in DB:          {sum_row['total_assignments']}")
        print(f"  • Created in Sep–Oct:               {sum_row['created_in_sep_oct']}")
        print(f"  • Created in Nov (Current Cohorts): {sum_row['created_in_nov']}")
        print(f"  • Deadlines Expired before Nov 1:   {sum_row['expired_before_nov']}\n")

        # 2. Select target assignments based on mode
        if mode == "expired-only":
            where_clause = "a.deadline < '2026-11-01'"
            mode_desc = "Assignments with deadlines that expired BEFORE November 1, 2026"
        else:
            where_clause = "a.created_at >= '2026-09-01' AND a.created_at < '2026-11-01'"
            mode_desc = "ALL assignments created between September 1 and October 31, 2026"

        print(f"TARGET QUERY FILTER: {mode_desc}")
        print("-" * 80)

        query = f"""
            SELECT 
                a.id,
                a.title,
                g.name as group_name,
                a.cycle_number,
                a.created_at,
                a.deadline,
                a.status,
                COUNT(s.id) as sub_count
            FROM assignments a
            JOIN groups g ON a.group_id = g.id
            LEFT JOIN submissions s ON s.assignment_id = a.id
            WHERE {where_clause}
            GROUP BY a.id, a.title, g.name, a.cycle_number, a.created_at, a.deadline, a.status
            ORDER BY a.deadline ASC, a.created_at ASC;
        """
        res_targets = await session.execute(text(query))
        targets = res_targets.mappings().all()

        if not targets:
            print("No matching assignments found for this filter.")
            return

        total_targeted_assignments = len(targets)
        total_targeted_submissions = sum(r["sub_count"] for r in targets)

        print(f"Found {total_targeted_assignments} matching assignments with {total_targeted_submissions} total submissions:\n")
        print(f"{'#':<3} | {'Group':<22} | {'Title':<24} | {'Deadline':<16} | {'Subs':<5} | {'Cycle'}")
        print("-" * 80)
        for idx, r in enumerate(targets, start=1):
            dl_str = r['deadline'].strftime('%Y-%m-%d %H:%M') if r['deadline'] else 'N/A'
            print(f"{idx:<3} | {r['group_name'][:22]:<22} | {r['title'][:24]:<24} | {dl_str:<16} | {r['sub_count']:<5} | {r['cycle_number']}")

        print("-" * 80)
        print(f"Total Targeted: {total_targeted_assignments} assignments, {total_targeted_submissions} submissions.")

        if not confirm_delete:
            print("\n[DRY RUN COMPLETE] No records were modified or deleted.")
            print("To delete these targeted items, re-run with: --confirm-delete")
            return

        # 3. Confirmed Deletion execution inside atomic transaction
        print("\n[EXECUTING SAFE DELETION IN ATOMIC TRANSACTION]...")
        target_ids = [str(r["id"]) for r in targets]
        id_list_str = "'" + "','".join(target_ids) + "'"

        # Delete dependent submission comments
        del_comments = await session.execute(text(f"""
            DELETE FROM submission_comments
            WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id IN ({id_list_str}));
        """))
        print(f"  • Deleted {del_comments.rowcount} submission comments")

        # Delete dependent submission images
        del_sub_images = await session.execute(text(f"""
            DELETE FROM submission_images
            WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id IN ({id_list_str}));
        """))
        print(f"  • Deleted {del_sub_images.rowcount} submission images")

        # Delete dependent grades
        del_grades = await session.execute(text(f"""
            DELETE FROM grades
            WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id IN ({id_list_str}));
        """))
        print(f"  • Deleted {del_grades.rowcount} submission grades")

        # Delete submissions
        del_subs = await session.execute(text(f"""
            DELETE FROM submissions WHERE assignment_id IN ({id_list_str});
        """))
        print(f"  • Deleted {del_subs.rowcount} student submissions")

        # Delete task lock overrides
        del_overrides = await session.execute(text(f"""
            DELETE FROM task_lock_overrides WHERE assignment_id IN ({id_list_str});
        """))
        print(f"  • Deleted {del_overrides.rowcount} task lock overrides")

        # Delete assignment images
        del_asgn_images = await session.execute(text(f"""
            DELETE FROM assignment_images WHERE assignment_id IN ({id_list_str});
        """))
        print(f"  • Deleted {del_asgn_images.rowcount} assignment attachment images")

        # Delete assignments
        del_asgns = await session.execute(text(f"""
            DELETE FROM assignments WHERE id IN ({id_list_str});
        """))
        print(f"  • Deleted {del_asgns.rowcount} assignments")

        await session.commit()
        print("\n✅ TRANSACTION COMMITTED SUCCESSFULLY! Selected records have been cleaned up.")


def main():
    parser = argparse.ArgumentParser(description="Audit and preview September-October LMS records.")
    parser.add_argument(
        "--mode",
        choices=["expired-only", "all-sep-oct"],
        default="expired-only",
        help="expired-only: targets only assignments whose deadlines expired before Nov 1 (Recommended). all-sep-oct: targets all assignments created in Sep-Oct.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Preview matched records without deleting anything (Default: True).",
    )
    parser.add_argument(
        "--confirm-delete",
        action="store_true",
        default=False,
        help="Explicit flag required to execute deletion.",
    )
    args = parser.parse_args()

    is_confirmed = args.confirm_delete
    asyncio.run(run_preview_and_cleanup(mode=args.mode, confirm_delete=is_confirmed))


if __name__ == "__main__":
    main()

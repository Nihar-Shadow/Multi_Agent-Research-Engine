"""Add darkspot_report column to research_runs and sessions.

Revision ID: 0031_darkspot_report
Revises: 0030_run_grounding_report
"""

import sqlalchemy as sa
from alembic import op

revision = "0031_darkspot_report"
down_revision = "0030_run_grounding_report"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("research_runs", sa.Column("darkspot_report", sa.JSON(), nullable=True))
    op.add_column("sessions", sa.Column("darkspot_report", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("research_runs", "darkspot_report")
    op.drop_column("sessions", "darkspot_report")

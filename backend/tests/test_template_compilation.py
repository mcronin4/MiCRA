"""
Compile-validation tests for workflow templates.

Runs every template in seed_workflows.TEMPLATES through the blueprint compiler
to verify structural validity: correct node types, valid handle connections,
and runtime type compatibility.
"""

import pytest
import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.db.seed_workflows import TEMPLATES
from app.services.blueprint_compiler import compile_workflow


@pytest.fixture(params=TEMPLATES, ids=lambda t: t["name"])
def template(request):
    return request.param


def test_template_compiles_successfully(template):
    """Each template must pass blueprint compilation without errors."""
    result = compile_workflow(
        nodes=template["workflow_data"]["nodes"],
        edges=template["workflow_data"]["edges"],
        name=template["name"],
    )

    if not result.success:
        diag_lines = [
            f"  [{d.level}] {d.message} (node: {d.node_id}, edge: {d.edge_id})"
            for d in result.diagnostics
        ]
        pytest.fail(
            f"Template '{template['name']}' failed compilation:\n"
            + "\n".join(diag_lines)
        )

    assert result.blueprint is not None
    assert len(result.blueprint.nodes) == len(template["workflow_data"]["nodes"])


def test_template_has_required_metadata(template):
    """Each template must have a name and description."""
    assert template["name"], "Template name must not be empty"
    assert template["description"], "Template description must not be empty"
    assert len(template["name"]) <= 255, "Template name exceeds 255 characters"


def test_template_nodes_have_unique_ids(template):
    """Node IDs within a template must be unique."""
    node_ids = [n["id"] for n in template["workflow_data"]["nodes"]]
    assert len(node_ids) == len(set(node_ids)), f"Duplicate node IDs: {node_ids}"


def test_template_edges_reference_valid_nodes(template):
    """Every edge source/target must reference a node that exists in the template."""
    node_ids = {n["id"] for n in template["workflow_data"]["nodes"]}
    for edge in template["workflow_data"]["edges"]:
        assert edge["source"] in node_ids, (
            f"Edge {edge['id']} references unknown source '{edge['source']}'"
        )
        assert edge["target"] in node_ids, (
            f"Edge {edge['id']} references unknown target '{edge['target']}'"
        )


def test_all_templates_have_unique_names():
    """Template names must be globally unique (seed script uses name for dedup)."""
    names = [t["name"] for t in TEMPLATES]
    assert len(names) == len(set(names)), f"Duplicate template names: {names}"


def test_expected_template_count():
    """Verify the expected number of templates are defined."""
    assert len(TEMPLATES) == 7, f"Expected 7 templates, got {len(TEMPLATES)}"

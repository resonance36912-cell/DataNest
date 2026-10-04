from pathlib import Path

from foundry_controller.app.main import app


def test_v13_routes_are_registered():
    paths = {route.path for route in app.routes}
    required = {
        '/v1/source-ingestion/{app_id}/stage-local',
        '/v1/source-ingestion/{app_id}/status',
        '/v1/source-ingestion/{app_id}/import',
        '/v1/migration-execution/{app_id}/prepare',
        '/v1/migration-execution/{app_id}/execute-supported',
        '/v1/migration-execution/{app_id}/verify',
        '/v1/migration-execution/{app_id}/rollback',
    }
    assert required <= paths
    assert app.version == '1.5.8'

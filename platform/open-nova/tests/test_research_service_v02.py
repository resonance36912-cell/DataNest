from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from foundry_controller.app.research_service import (  # noqa: E402
    ResearchPolicy,
    ResearchSecurityError,
    ResearchService,
    _extract_html_document,
    _parse_caption_payload,
    _parse_youtube_search_html,
    _validate_url_syntax,
    install_research_service,
)


PUBLIC_IPS = ["93.184.216.34"]


async def public_resolver(_host: str, _port: int) -> list[str]:
    return PUBLIC_IPS


def policy(**overrides: object) -> ResearchPolicy:
    values = {
        "max_sources": 8,
        "max_urls": 8,
        "max_content_chars": 20_000,
        "max_response_bytes": 500_000,
        "max_discovery_bytes": 500_000,
        "max_verify_bytes": 16_384,
        "connect_timeout_seconds": 1,
        "read_timeout_seconds": 1,
        "dns_timeout_seconds": 1,
        "runtime_root": None,
    }
    values.update(overrides)
    values.pop("runtime_root", None)
    return ResearchPolicy(**values)


def youtube_search_document() -> str:
    initial = {
        "contents": [
            {
                "videoRenderer": {
                    "videoId": "abcdefghijk",
                    "title": {"runs": [{"text": "A public research video"}]},
                    "detailedMetadataSnippets": [
                        {"snippetText": {"runs": [{"text": "A useful description"}]}}
                    ],
                }
            }
        ]
    }
    return f"<html><script>var ytInitialData = {json.dumps(initial)};</script></html>"


def youtube_watch_document(*, captions: bool) -> str:
    player: dict[str, object] = {
        "videoDetails": {
            "title": "Public video title",
            "shortDescription": "Public video description",
        }
    }
    if captions:
        player["captions"] = {
            "playerCaptionsTracklistRenderer": {
                "captionTracks": [
                    {
                        "languageCode": "en",
                        "baseUrl": "https://www.youtube.com/api/timedtext?v=abcdefghijk",
                    }
                ]
            }
        }
    return f"<html><script>var ytInitialPlayerResponse = {json.dumps(player)};</script></html>"


def test_html_and_caption_parsers_strip_active_content() -> None:
    title, description, content = _extract_html_document(
        "<html><head><title>Useful &amp; Safe</title>"
        '<meta name="description" content="Summary"></head>'
        "<body><script>alert('x')</script><nav>Menu</nav><main><h1>Heading</h1>"
        "<p>Evidence text.</p></main></body></html>",
        5_000,
    )
    assert title == "Useful & Safe"
    assert description == "Summary"
    assert "alert" not in content
    assert "Evidence text." in content
    assert _parse_caption_payload("<transcript><text>Hello &amp; world</text></transcript>", 100) == "Hello & world"


def test_youtube_search_parser_is_deterministic_and_deduplicated() -> None:
    sources = _parse_youtube_search_html(youtube_search_document(), 6)
    assert sources == [
        {
            "url": "https://www.youtube.com/watch?v=abcdefghijk",
            "title": "A public research video",
            "description": "A useful description",
            "type": "youtube",
            "provider": "youtube-public-search",
            "selected": True,
        }
    ]


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/",
        "https://user:pass@example.com/",
        "https://localhost/",
        "https://127.0.0.1/",
        "https://[::1]/",
        "https://169.254.169.254/latest/meta-data/",
        "https://example.com:444/",
        "file:///etc/passwd",
    ],
)
def test_url_syntax_rejects_non_governed_targets(url: str) -> None:
    with pytest.raises(ResearchSecurityError):
        _validate_url_syntax(url, frozenset({"https"}))


def test_dns_and_redirect_ssrf_are_blocked(tmp_path: Path) -> None:
    async def private_resolver(_host: str, _port: int) -> list[str]:
        return ["10.0.0.5"]

    service = ResearchService(policy=policy(), runtime_root=tmp_path, resolver=private_resolver)
    with pytest.raises(ResearchSecurityError):
        asyncio.run(service._validated_url("https://example.com/"))

    def redirect_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://127.0.0.1/private"})

    guarded = ResearchService(
        policy=policy(),
        runtime_root=tmp_path,
        resolver=public_resolver,
        transport=httpx.MockTransport(redirect_handler),
    )
    with pytest.raises(ResearchSecurityError):
        asyncio.run(guarded._safe_fetch("https://example.com/"))


def test_discovery_returns_web_and_youtube_without_keys(tmp_path: Path) -> None:
    bing_xml = (
        "<rss><channel><item><title>Example research</title>"
        "<link>https://example.com/article</link>"
        "<description>Evidence summary</description></item></channel></rss>"
    )
    wikipedia = {"query": {"search": [{"title": "Research topic", "snippet": "Encyclopedia entry"}]}}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "www.bing.com":
            return httpx.Response(200, text=bing_xml, headers={"content-type": "application/rss+xml"})
        if request.url.host == "en.wikipedia.org":
            return httpx.Response(200, json=wikipedia)
        if request.url.host == "www.youtube.com":
            return httpx.Response(200, text=youtube_search_document(), headers={"content-type": "text/html"})
        raise AssertionError(f"unexpected URL: {request.url}")

    receipts: list[dict[str, object]] = []
    service = ResearchService(
        policy=policy(),
        runtime_root=tmp_path,
        receipt_writer=receipts.append,
        resolver=public_resolver,
        transport=httpx.MockTransport(handler),
    )
    result = asyncio.run(service.discover("Sovereign research"))
    assert result["stats"]["web"] >= 1
    assert result["stats"]["youtube"] == 1
    assert all(item["selected"] for item in result["sources"])
    assert receipts[-1]["external_ai_used"] is False
    assert receipts[-1]["paid_api_used"] is False
    assert "topic" not in receipts[-1]
    assert len(str(receipts[-1]["topic_sha256"])) == 64


def test_verify_contract_and_selected_url_job(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "example.com":
            return httpx.Response(
                200,
                text="<html><head><title>Chosen source</title></head>"
                "<body><main><p>Selected source evidence.</p></main></body></html>",
                headers={"content-type": "text/html"},
            )
        raise AssertionError(f"unexpected URL: {request.url}")

    service = ResearchService(
        policy=policy(),
        runtime_root=tmp_path,
        resolver=public_resolver,
        transport=httpx.MockTransport(handler),
    )
    async def scenario() -> tuple[dict[str, object], dict[str, object] | None]:
        verified = await service.verify(["https://example.com/chosen"])
        job_id = await service.start_job(
            "A topic that is never sent to an AI",
            {"language": "en"},
            ["https://example.com/chosen"],
        )
        await asyncio.gather(*tuple(service._job_tasks))
        return verified, service.get_job(job_id, include_results=True)

    verified, job = asyncio.run(scenario())
    assert verified["results"][0]["accessible"] is True
    assert verified["stats"] == {"total": 1, "accessible": 1, "unavailable": 0}
    assert job is not None
    assert job["status"] == "complete"
    source = job["processedSources"][0]
    assert source["url"] == "https://example.com/chosen"
    assert source["status"] == "ready"
    assert "Selected source evidence" in source["content"]
    assert len(source["contentHash"]) == 64


def test_youtube_without_captions_is_honest_metadata_source(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "www.youtube.com"
        return httpx.Response(200, text=youtube_watch_document(captions=False), headers={"content-type": "text/html"})

    service = ResearchService(
        policy=policy(),
        runtime_root=tmp_path,
        resolver=public_resolver,
        transport=httpx.MockTransport(handler),
    )
    source = asyncio.run(
        service._process_candidate(
            {
                "url": "https://www.youtube.com/watch?v=abcdefghijk",
                "title": "Public video title",
                "type": "youtube",
                "provider": "youtube-public-search",
            },
            "en",
        )
    )
    assert source["status"] == "ready"
    assert source["transcriptAvailable"] is False
    assert source["extractionProvider"] == "youtube-public-metadata"
    assert "metadata only" in source["content"]


def test_api_is_loopback_and_origin_restricted(tmp_path: Path) -> None:
    app = FastAPI()
    install_research_service(
        app,
        policy_path=tmp_path / "missing-policy.json",
        runtime_root=tmp_path / "runtime",
    )
    async def scenario() -> tuple[httpx.Response, httpx.Response]:
        transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 43123))
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
            ok = await client.get("/v1/research/health", headers={"origin": "http://localhost:3101"})
            denied = await client.get("/v1/research/health", headers={"origin": "https://example.com"})
        return ok, denied

    ok, denied = asyncio.run(scenario())
    assert ok.status_code == 200
    assert ok.json()["externalAiUsed"] is False
    assert ok.json()["creditsRequired"] is False
    assert denied.status_code == 403

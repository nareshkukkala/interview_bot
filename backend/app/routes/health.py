from fastapi import APIRouter

from app.core.config import APP_NAME, APP_VERSION, settings
from app.schemas.health import HealthResponse
from app.services import gemini_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness check. Reports whether a Gemini key is set — never the key itself."""
    return HealthResponse(
        status="ok",
        service=APP_NAME,
        version=APP_VERSION,
        ai_configured=gemini_service.is_configured(),
        model=settings.gemini_model,
    )

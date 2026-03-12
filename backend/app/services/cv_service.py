from azure.ai.vision.imageanalysis import ImageAnalysisClient
from azure.ai.vision.imageanalysis.models import VisualFeatures
from azure.core.credentials import AzureKeyCredential
from app.core.config import settings

def analyze_safety_image(image_bytes: bytes) -> dict:
    """Azure AI Vision으로 안전모/조끼 착용 여부 판별.
    Returns: {"passed": bool, "tags": list}
    """
    client = ImageAnalysisClient(
        endpoint=settings.AZURE_CV_ENDPOINT,
        credential=AzureKeyCredential(settings.AZURE_CV_KEY),
    )
    result = client.analyze(
        image_data=image_bytes,
        visual_features=[VisualFeatures.TAGS],
    )
    tags = [t.name.lower() for t in (result.tags.list if result.tags else [])]
    passed = "helmet" in tags or "hard hat" in tags
    return {"passed": passed, "tags": tags}

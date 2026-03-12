from azure.storage.blob import BlobServiceClient
from app.core.config import settings
import uuid

def upload_image(image_bytes: bytes, filename: str) -> str:
    """Azure Blob Storage에 이미지 업로드 후 URL 반환."""
    client = BlobServiceClient.from_connection_string(settings.AZURE_BLOB_CONNECTION_STRING)
    container = client.get_container_client(settings.AZURE_BLOB_CONTAINER)
    blob_name = f"{uuid.uuid4()}_{filename}"
    container.upload_blob(blob_name, image_bytes, overwrite=True)
    return f"{settings.AZURE_BLOB_CONNECTION_STRING.split(';')[0]}/{settings.AZURE_BLOB_CONTAINER}/{blob_name}"

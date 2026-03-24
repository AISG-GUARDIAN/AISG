"""
컴퓨터 비전 서비스.

3단계 파이프라인으로 안전물품 착용 여부를 판별한다:
1. Azure Face API — 정면 얼굴 감지
2. Pillow — 얼굴 영역 모자이크 처리 (개인정보 보호)
3. Azure Custom Vision — 안전모/안전조끼 착용 판별

이미지는 메모리에서만 처리하며 원본·모자이크 모두 저장하지 않는다.
"""

import io
import logging

import httpx
from PIL import Image, ImageFilter

from app.core.config import get_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1단계: Face API — 정면 얼굴 감지 (REST API)
# ---------------------------------------------------------------------------

def detect_frontal_face(image_data: bytes) -> dict:
    """
    Azure Face API REST 호출로 정면 얼굴을 감지한다.

    Args:
        image_data: 이미지 바이너리 데이터

    Returns:
        dict: {
            "is_frontal": bool — 정면 여부,
            "face_rects": list[dict] — [{"left", "top", "width", "height"}, ...],
            "reason": str — 실패 사유 (성공 시 빈 문자열),
        }
    """
    settings = get_settings()

    # Face API 키 미설정 — 개발 모드
    if not settings.AZURE_FACE_KEY:
        logger.warning("Azure Face API 키 미설정 — 개발 모드(정면 판정 스킵)")
        return {"is_frontal": True, "face_rects": [], "reason": ""}

    try:
        base = settings.AZURE_FACE_API.rstrip("/")
        url = (
            f"{base}/face/v1.0/detect"
            f"?returnFaceId=false"
            f"&returnFaceAttributes=headPose"
            f"&recognitionModel=recognition_04"
            f"&detectionModel=detection_03"
        )
        headers = {
            "Ocp-Apim-Subscription-Key": settings.AZURE_FACE_KEY,
            "Content-Type": "application/octet-stream",
        }

        resp = httpx.post(url, headers=headers, content=image_data, timeout=30.0)
        resp.raise_for_status()
        faces = resp.json()

        if not faces:
            return {"is_frontal": False, "face_rects": [], "reason": "얼굴이 감지되지 않았습니다"}

        if len(faces) > 1:
            logger.warning(f"감지된 얼굴이 {len(faces)}개로 인해 검사를 진행할 수 없습니다.")
            return {"is_frontal": False, "face_rects": [], "reason": "얼굴이 2개 이상 감지되어 검사를 진행하지 않습니다."}

        # 감지된 얼굴 좌표 추출
        face_rects = []
        for face in faces:
            rect = face["faceRectangle"]
            face_rects.append({
                "left": rect["left"],
                "top": rect["top"],
                "width": rect["width"],
                "height": rect["height"],
            })

        # 정면 판정 기준: yaw(좌우) ±20°, pitch(상하) ±20°
        head_pose = faces[0]["faceAttributes"]["headPose"]
        is_frontal = abs(head_pose["yaw"]) <= 20 and abs(head_pose["pitch"]) <= 20

        if not is_frontal:
            return {
                "is_frontal": False,
                "face_rects": face_rects,
                "reason": "정면을 바라봐 주세요",
            }

        return {"is_frontal": True, "face_rects": face_rects, "reason": ""}

    except Exception as e:
        logger.error(f"Face API 호출 실패: {e}", exc_info=True)
        return {"is_frontal": False, "face_rects": [], "reason": f"얼굴 감지 오류: {e}"}


# ---------------------------------------------------------------------------
# 2단계: 모자이크 처리 — 개인정보 보호
# ---------------------------------------------------------------------------

def mosaic_face(image_data: bytes, face_rects: list) -> bytes:
    """
    얼굴 영역을 모자이크(픽셀화) 처리한다.

    Args:
        image_data: 원본 이미지 바이너리 데이터
        face_rect: {"left", "top", "width", "height"} — Face API에서 받은 좌표

    Returns:
        bytes: 모자이크 처리된 이미지 바이너리 (JPEG)
    """
    img = Image.open(io.BytesIO(image_data))

    # 🚀 [핵심 수정] 리스트 안의 모든 얼굴 좌표를 꺼내어 순회하며 모자이크 적용
    for rect in face_rects:
        left = rect["left"]
        top = rect["top"]
        width = rect["width"]
        height = rect["height"]
        
        right = left + width
        bottom = top + height

        # 좌표가 이미지 밖을 벗어나지 않도록 안전장치
        left, top = max(0, left), max(0, top)
        right, bottom = min(img.width, right), min(img.height, bottom)

        # 얼굴 영역 크롭 → 축소 → 확대 (픽셀화 효과)
        face_region = img.crop((left, top, right, bottom))
        small = face_region.resize(
            (max(1, width // 20), max(1, height // 20)), # 블러 처리 2배 강화
            resample=Image.BILINEAR,
        )
        mosaic = small.resize(face_region.size, resample=Image.NEAREST)

        img.paste(mosaic, (left, top, right, bottom))

    # JPEG 바이트로 변환
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# 3단계: Custom Vision — 안전물품 판별
# ---------------------------------------------------------------------------

def analyze_safety_equipment(image_data: bytes) -> dict:
    """
    Custom Vision REST API(Object Detection)로 안전모/조끼 착용 여부를 판별한다.

    엔드포인트 형식:
    POST {ENDPOINT}/customvision/v3.0/Prediction/{PROJECT_ID}/detect/iterations/{PUBLISH_NAME}/image

    Args:
        image_data: 모자이크 처리된 이미지 바이너리

    Returns:
        dict: {
            "helmet_pass": bool,
            "vest_pass": bool,
            "cv_confidence": float,
            "status": "pass" | "fail",
        }
    """
    settings = get_settings()

    # Custom Vision 키 미설정 — 개발 모드
    if not settings.AZURE_CUSTOM_KEY or not settings.AZURE_CUSTOM_VISION_PROJECT_ID:
        logger.warning("Azure Custom Vision 키/프로젝트 미설정 — 개발 모드(항상 pass)")
        return {
            "helmet_pass": True,
            "vest_pass": True,
            "cv_confidence": 1.0,
            "status": "pass",
        }

    try:
        # Object Detection 엔드포인트 조합
        base = settings.AZURE_CUSTOM_VISION_ENDPOINT.rstrip("/")
        project_id = settings.AZURE_CUSTOM_VISION_PROJECT_ID
        publish_name = settings.AZURE_CUSTOM_VISION_PUBLISH_NAME
        url = f"{base}/customvision/v3.0/Prediction/{project_id}/detect/iterations/{publish_name}/image"

        headers = {
            "Prediction-Key": settings.AZURE_CUSTOM_KEY,
            "Content-Type": "application/octet-stream",
        }

        response = httpx.post(url, headers=headers, content=image_data, timeout=30.0)
        response.raise_for_status()
        result = response.json()

        # 태그별 최고 확률 추출 (Object Detection은 동일 태그로 여러 박스가 나올 수 있음)
        tag_probs: dict[str, float] = {}
        for p in result.get("predictions", []):
            tag = p["tagName"].lower()
            prob = p["probability"]
            if prob > tag_probs.get(tag, 0.0):
                tag_probs[tag] = prob

        logger.info(f"Custom Vision 결과: {tag_probs}")

        # 착용/미착용 태그 비교 판정
        # hardhat vs no-hardhat: 점수가 높은 쪽 채택, 동점이면 fail
        hardhat_prob = tag_probs.get("hardhat", 0.0)
        no_hardhat_prob = tag_probs.get("no-hardhat", 0.0)
        if hardhat_prob > no_hardhat_prob:
            helmet_pass = True
            helmet_conf = hardhat_prob
        else:
            # no-hardhat이 같거나 높으면 미착용
            helmet_pass = False
            helmet_conf = no_hardhat_prob

        # safety vest vs no-safety vest
        vest_prob = tag_probs.get("safety vest", 0.0)
        no_vest_prob = tag_probs.get("no-safety vest", 0.0)
        if vest_prob > no_vest_prob:
            vest_pass = True
            vest_conf = vest_prob
        else:
            vest_pass = False
            vest_conf = no_vest_prob

        cv_confidence = round((helmet_conf + vest_conf) / 2, 3)
        status = "pass" if (helmet_pass and vest_pass) else "fail"

        logger.info(
            f"판정: hardhat={hardhat_prob:.3f} vs no-hardhat={no_hardhat_prob:.3f} → {'착용' if helmet_pass else '미착용'} | "
            f"vest={vest_prob:.3f} vs no-vest={no_vest_prob:.3f} → {'착용' if vest_pass else '미착용'}"
        )

        return {
            "helmet_pass": helmet_pass,
            "vest_pass": vest_pass,
            "cv_confidence": cv_confidence,
            "status": status,
        }

    except Exception as e:
        logger.error(f"Custom Vision API 호출 실패: {e}", exc_info=True)
        return {
            "helmet_pass": False,
            "vest_pass": False,
            "cv_confidence": 0.0,
            "status": "fail",
        }


# ---------------------------------------------------------------------------
# 메인 파이프라인
# ---------------------------------------------------------------------------

def analyze_safety_image(image_data: bytes) -> dict:
    """
    3단계 파이프라인으로 안전물품 착용 여부를 판별한다.

    흐름:
    1. Face API — 정면 얼굴 감지 (실패 시 retry 응답)
    2. 모자이크 — 얼굴 영역 픽셀화 (개인정보 보호)
    3. Custom Vision — 안전모/조끼 판별

    Args:
        image_data: 이미지 바이너리 데이터

    Returns:
        dict: {
            "status": "pass" | "fail" | "retry",
            "helmet_pass": bool | None,
            "vest_pass": bool | None,
            "cv_confidence": float,
            "face_detected": bool,
            "retry_reason": str — retry 시 사유,
        }
    """
    logger.info(f"[파이프라인] 시작 — 이미지 크기: {len(image_data)} bytes")

    # 1단계: 정면 얼굴 감지
    face_result = detect_frontal_face(image_data)
    logger.info(f"[1단계 Face API] 정면={face_result['is_frontal']}, 사유={face_result['reason']}")

    if not face_result["is_frontal"]:
        return {
            "status": "retry",
            "helmet_pass": None,
            "vest_pass": None,
            "cv_confidence": 0.0,
            "face_detected": len(face_result.get("face_rects", [])) > 0,
            "retry_reason": face_result["reason"],
        }

    # 2단계: [수정] face_rects 리스트를 받아 모든 얼굴을 모자이크 처리
    face_rects = face_result.get("face_rects", [])
    if face_rects:
        processed_image = mosaic_face(image_data, face_rects)
        logger.info(f"[2단계 모자이크] 완료 — 처리된 얼굴 수: {len(face_rects)}명")
    else:
        processed_image = image_data
        logger.info("[2단계 모자이크] 스킵 — 얼굴 없음")

    # 3단계: Custom Vision 판별
    safety_result = analyze_safety_equipment(processed_image)
    logger.info(
        f"[3단계 Custom Vision] helmet={safety_result['helmet_pass']}, "
        f"vest={safety_result['vest_pass']}, confidence={safety_result['cv_confidence']}, "
        f"status={safety_result['status']}"
    )

    return {
        "status": safety_result["status"],
        "helmet_pass": safety_result["helmet_pass"],
        "vest_pass": safety_result["vest_pass"],
        "cv_confidence": safety_result["cv_confidence"],
        "face_detected": True,
        "retry_reason": "",
    }

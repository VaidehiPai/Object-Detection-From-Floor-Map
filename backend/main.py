from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import io
import cv2
import numpy as np
import base64
import os

app = FastAPI()

# 1. Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. LOAD MODEL (Prioritize ONNX for Speed/Memory)
# Check for ONNX first because it fits on the Free Tier
possible_paths = [
    "backend/best.onnx", 
    "best.onnx",
    "backend/best.pt",
    "best.pt"
]

model_path = None
for path in possible_paths:
    if os.path.exists(path):
        model_path = path
        break

if model_path:
    print(f"Loading model from: {model_path}")
    # task='segment' ensures it loads correctly for segmentation
    model = YOLO(model_path, task='segment') 
else:
    print("ERROR: Could not find best.onnx or best.pt. Using fallback.")
    model = YOLO("yolov8n-seg.pt")

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    # Resize (1024px is fine for ONNX usually)
    max_size = 1024
    ratio = max_size / max(image.width, image.height)
    new_size = (int(image.width * ratio), int(image.height * ratio))
    image = image.resize(new_size, Image.Resampling.LANCZOS)

    # Run inference
    # Note: ONNX ignores 'imgsz' sometimes, but we keep it for consistency
    results = model(image, conf=0.25, imgsz=1024)
    result = results[0]

    # --- COUNT DETECTIONS ---
    counts = {}
    if result.boxes:
        for box in result.boxes:
            cls_id = int(box.cls[0])
            if result.names:
                label = result.names[cls_id]
                counts[label] = counts.get(label, 0) + 1
    # ------------------------

    # Generate Image
    annotated_frame = result.plot(img=np.array(image))
    annotated_frame_rgb = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
    final_image = Image.fromarray(annotated_frame_rgb)

    img_io = io.BytesIO()
    final_image.save(img_io, format='PNG')
    img_io.seek(0)

    img_base64 = base64.b64encode(img_io.getvalue()).decode("utf-8")

    return JSONResponse(content={
        "counts": counts,
        "image_base64": img_base64,
        "image_mime": "image/png"
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
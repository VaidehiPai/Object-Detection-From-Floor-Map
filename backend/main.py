from fastapi import FastAPI, File, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import io
import cv2
import numpy as np

app = FastAPI()

# 1. Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Load the model
try:
    model = YOLO("best.pt")
    print("Loaded best.pt successfully")
except Exception as e:
    print(f"Could not load best.pt: {e}. Loading standard YOLOv8n-seg instead.")
    model = YOLO("yolov8n-seg.pt")

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    # 3. Read the image file
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    # --- NEW STEP: Resize Image to 1024px ---
    # Calculate new size maintaining aspect ratio
    max_size = 1024
    ratio = max_size / max(image.width, image.height)
    new_size = (int(image.width * ratio), int(image.height * ratio))
    
    # Resize the image using high-quality resampling
    image = image.resize(new_size, Image.Resampling.LANCZOS)
    # ----------------------------------------

    # 4. Run inference
    # We pass imgsz=1024 so the model runs at the same resolution as our image
    results = model(image, conf=0.25, imgsz=1024)
    result = results[0]

    # 5. Generate the annotated image
    # We pass the resized image explicitly to ensure the drawing matches perfectly
    annotated_frame = result.plot(img=np.array(image))

    # 6. Convert BGR to RGB
    annotated_frame_rgb = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)

    # 7. Convert back to PIL Image
    final_image = Image.fromarray(annotated_frame_rgb)

    # 8. Save to memory buffer
    img_io = io.BytesIO()
    final_image.save(img_io, format='PNG')
    img_io.seek(0)

    # 9. Return the image response
    return Response(content=img_io.getvalue(), media_type="image/png")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
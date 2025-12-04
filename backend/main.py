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
import gc

app = FastAPI()

# --- CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None

def get_model():
    global model
    if model is None:
        print("Loading model...")
        possible_paths = ["backend/best.onnx", "best.onnx", "backend/best.pt", "best.pt"]
        model_path = next((p for p in possible_paths if os.path.exists(p)), None)
        
        if model_path:
            model = YOLO(model_path, task='segment')
            print(f"Model loaded: {model_path}")
        else:
            model = YOLO("yolov8n-seg.pt")
        
        gc.collect()
    return model

@app.get("/")
def home():
    return {"status": "Live"}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    try:
        current_model = get_model()

        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")

        # --- KEY FIX: RESIZE TO 640px ---
        # This prevents the memory spike that crashes the server
        max_size = 640
        if max(image.width, image.height) > max_size:
            ratio = max_size / max(image.width, image.height)
            new_size = (int(image.width * ratio), int(image.height * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        # --------------------------------

        # Run inference at 640px
        results = current_model(image, conf=0.25, imgsz=640)
        result = results[0]

        # Count Objects
        counts = {}
        if result.boxes:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                if result.names:
                    label = result.names[cls_id]
                    counts[label] = counts.get(label, 0) + 1

        # Draw Annotations
        annotated_frame = result.plot(img=np.array(image))
        annotated_frame_rgb = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
        final_image = Image.fromarray(annotated_frame_rgb)

        img_io = io.BytesIO()
        final_image.save(img_io, format='PNG')
        img_io.seek(0)
        img_base64 = base64.b64encode(img_io.getvalue()).decode("utf-8")

        # Cleanup Memory
        del results, result, annotated_frame, final_image, image
        gc.collect()

        return JSONResponse(content={
            "counts": counts,
            "image_base64": img_base64,
            "image_mime": "image/png"
        })

    except Exception as e:
        print(f"Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
# Vision Aid Demo

**Vietnamese TTS | Image Recognition | OCR for Vietnamese**

## Introduction

Vision Aid Demo is a project that combines image and audio processing technologies to support users with:
- **Image Captioning** - Describing the content of images
- **Optical Character Recognition (OCR)** - Extracting text from images
- **Vietnamese TTS (Text-to-Speech)** - Converting text into Vietnamese speech

This project uses the Vintern-1B-v3_5 language model through llama.cpp to handle these tasks.

## Installation

### System Requirements
- Operating System: Windows/Linux/macOS
- Python 3.8+
- Node.js (if using the web interface)
- GPU (optional, but recommended for performance boost)

### Installing llama.cpp

1. Clone the repository and navigate into the llama.cpp directory:
   ```bash
   git clone https://github.com/ggerganov/llama.cpp.git
   cd llama.cpp
Build:

bash
Copy code
mkdir build
cd build
cmake ..
cmake --build . --config Release
On Windows, you may need to install additional development tools.

Installing Required Python Libraries
bash
Copy code
pip install -r requirements.txt
Usage
Running the llama server
bash
Copy code
./llama-server -hf ngxson/Vintern-1B-v3_5-GGUF --chat-template vicuna
Notes:

If you are using a GPU (NVidia/AMD/Intel), add the -ngl 99 parameter to enable GPU:

bash
Copy code
./llama-server -hf ngxson/Vintern-1B-v3_5-GGUF --chat-template vicuna -ngl 99
(Optional) You can adjust the model instructions, e.g., asking it to return JSON instead of plain descriptions.

Starting the Application
Open the webpage in your browser (if the web interface is installed)

Click on "Start" to begin using the service

Features
1. Image Captioning
Automatically recognizes and describes the content of images

Supports multiple common image formats (JPEG, PNG, BMP)

2. Optical Character Recognition (OCR)
Extracts text from images

Supports Vietnamese text recognition

3. Vietnamese TTS (Text-to-Speech)
Converts text into Vietnamese speech

Supports multiple voice options

Contributing
Contributions to the project are always welcome. Please submit Pull Requests or open Issues if you want to contribute.

License
This project is distributed under the MIT license. See the LICENSE file for details.

Replace this file with any local MP4 of a dog:

  frontend/public/assets/demo-dog.mp4

The UI always loads this path and labels the mode as「示範影片」.
It is not a live camera.

Prefer a clip that shows temporal change, for example:

1. walking or changing position
2. playing
3. lying still, then moving the head / chewing
4. interacting with an object

A completely static sitting clip will correctly look like「休息」after the temporal engine
has accumulated a few seconds of low movement. Drop in a more dynamic MP4 to demonstrate
lying-but-active vs actually resting.

Place MP4 files here. The UI reads these paths and labels the mode as「示範影片」.

  dog-playing.mp4   狗狗玩耍（預設示範）
  dog-walking.mp4   狗狗走動
  dog-resting.mp4   狗狗休息
  dog-eating.mp4    狗狗進食／與物件互動
  dog-mixed.mp4     家居活動（同一隻狗、同一個客廳；休息→走動→玩耍→進食→走動）

Filenames must match `frontend/src/lib/demos.ts`.

To add another clip:

1. Drop an MP4 into this folder, for example `dog-door.mp4`.
2. Append an entry to `DEMO_VIDEOS` in `frontend/src/lib/demos.ts` (`id`, `title`, `icon`, `src`, `expectedActivity`, `expectedMovement`, `hint`).
3. Refresh the app. Switching clips calls `resetAnalysisSession()` so tracking and the timeline start clean.

Missing files show「尚未加入」and are not treated as a live camera.

Current Mixkit stock clips (free license; demo only):

- playing: Border Collie with a ball (`50688`)
- walking: pug running on grass (`45843`)
- eating: Border Collie at a bowl (`50687`)
- resting: original sitting indoor clip

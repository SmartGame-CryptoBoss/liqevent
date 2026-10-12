# Conference landing photos

These are mechanically optimized versions of existing real LIQ EVENT photographs.
No stock or generated images are used.

| Output | Existing source |
| --- | --- |
| `annual-awards-480.webp`, `annual-awards-960.webp`, `annual-awards-1280.webp` | `../case_annual_awards.jpg` |
| `annual-program-960.webp` | `../case_annual_program.jpg` |
| `education-stage-960.webp` | `../case_2024_stage.webp` |

To regenerate, run `node test/prepare-conference-images.cjs` with Sharp available.
The script resizes without enlargement, corrects EXIF rotation and encodes WebP
at quality 82. The landing reserves intrinsic dimensions and lazily loads case
photographs; its hero uses responsive image candidates.

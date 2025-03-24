# Video Files for Solmegle

This folder should contain 43 video files named from `1.mp4` to `43.mp4` that will be used as fallbacks when no real users are available for video chat.

## Requirements

- Each file should be named with just a number (e.g., `1.mp4`, `2.mp4`, etc.)
- Files should be MP4 format for best compatibility
- Keep file sizes reasonable (ideally under 5MB each) to ensure fast loading

## Important Note: Don't Commit Video Files

⚠️ **DO NOT COMMIT VIDEO FILES TO GIT** ⚠️

Video files are binary files that can make the repository very large. The .gitignore is set up to exclude .mp4 files in this directory.

## Adding Videos to Your Local Development Environment

For the application to function properly in development mode, you need to add your own videos to this directory:

1. Obtain appropriate video clips (e.g., from royalty-free sources)
2. Rename them to follow the `1.mp4` through `43.mp4` naming convention
3. Place them in this directory

## For Production

In a production environment, you should:

1. Either add these videos via your deployment pipeline
2. Or modify the application to use a CDN or object storage service instead

## Example Sources for Royalty-Free Videos

- [Pexels Videos](https://www.pexels.com/videos/)
- [Pixabay](https://pixabay.com/videos/)
- [Videvo](https://www.videvo.net/free-stock-videos/)

## Privacy & Legal Considerations

Ensure all videos:
- Are either created by you or properly licensed for this use
- Do not contain any inappropriate content
- Do not include identifiable individuals without their consent
- Follow all relevant privacy laws and regulations

## How the System Works

When a user connects to Solmegle and no real partners are available:
1. The system randomly selects one of these videos
2. The video plays in the stranger's video area
3. When the video ends, another random video is automatically selected
4. Each video has associated simulated chat messages that appear in the chat area

This creates the impression of an active platform with users even when real users are not currently available.

## Installation

Simply place your 43 video files in this directory, ensuring they follow the naming convention of `1.mp4` through `43.mp4`. 
import { CompareFacesCommand, DetectFacesCommand, FaceDetail, RekognitionClient } from '@aws-sdk/client-rekognition';
import { Gesture } from '../gesture';
import { EngineDecision, FaceEngine } from './face-engine';

const reject = (reason: string): EngineDecision => ({ decision: 'REJECTED', reason });

/** Automatic verification with AWS Rekognition (DetectFaces for the selfie and gesture, CompareFaces for each photo). */
export class RekognitionEngine implements FaceEngine {
  readonly name = 'rekognition' as const;
  readonly automated = true;
  private client = new RekognitionClient({ region: process.env.AWS_REGION });
  private threshold = Number(process.env.FACE_MATCH_THRESHOLD ?? 90);

  /** Selfie quality + gesture rules. Returns a message for the member when the selfie is not acceptable. */
  static selfieProblem(faces: FaceDetail[], gesture: Gesture): string | null {
    if (faces.length === 0) return 'We could not see a face in your selfie. Face the camera in good light.';
    if (faces.length > 1) return 'Only you should be in the selfie.';
    const f = faces[0];
    if ((f.Confidence ?? 0) < 90) return 'Your face is not clear enough. Face the camera in good light.';
    if (f.Sunglasses?.Value && (f.Sunglasses.Confidence ?? 0) > 80) return 'Please take off your sunglasses.';
    if ((f.Quality?.Brightness ?? 50) < 20) return 'The selfie is too dark. Move to a brighter place.';
    if ((f.Quality?.Sharpness ?? 50) < 20) return 'The selfie is blurry. Hold the phone steady.';
    if (gesture === 'SMILE' && !(f.Smile?.Value && (f.Smile.Confidence ?? 0) >= 80)) return 'Please smile with your teeth showing, as asked.';
    if (gesture === 'OPEN_MOUTH' && !(f.MouthOpen?.Value && (f.MouthOpen.Confidence ?? 0) >= 80)) return 'Please open your mouth wide, as asked.';
    if (gesture === 'TURN_SIDE' && Math.abs(f.Pose?.Yaw ?? 0) < 20) return 'Please turn your head to one side, as asked.';
    return null;
  }

  async verify({ selfie, photos, gesture }: { selfie: Buffer; photos: Buffer[]; gesture: Gesture }): Promise<EngineDecision> {
    const det = await this.client.send(new DetectFacesCommand({ Image: { Bytes: selfie }, Attributes: ['ALL'] }));
    const problem = RekognitionEngine.selfieProblem(det.FaceDetails ?? [], gesture);
    if (problem) return reject(problem);

    let lowest = 100;
    for (let i = 0; i < photos.length; i++) {
      const similarity = await this.similarity(selfie, photos[i]);
      if (similarity == null) return reject(`Photo ${i + 1} does not appear to show you. Remove it and try again.`);
      lowest = Math.min(lowest, similarity);
    }
    return { decision: 'APPROVED', score: Math.round(lowest * 10) / 10 };
  }

  async comparePhoto(selfie: Buffer, photo: Buffer) {
    return (await this.similarity(selfie, photo)) == null ? ('NO_MATCH' as const) : ('MATCH' as const);
  }

  /** Best similarity of the selfie face to ANY face in the photo (group photos are fine), or null if below the threshold / no face. */
  private async similarity(source: Buffer, target: Buffer): Promise<number | null> {
    try {
      const r = await this.client.send(new CompareFacesCommand({
        SourceImage: { Bytes: source }, TargetImage: { Bytes: target }, SimilarityThreshold: this.threshold, QualityFilter: 'NONE',
      }));
      const best = Math.max(0, ...(r.FaceMatches ?? []).map((m) => m.Similarity ?? 0));
      return best >= this.threshold ? best : null;
    } catch (e: any) {
      if (e?.name === 'InvalidParameterException') return null; // no face found in the photo
      throw e;
    }
  }
}

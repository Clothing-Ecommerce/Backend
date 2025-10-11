import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  deleteReview,
  updateReview,
  type ReviewMediaInput,
} from "../services/orderService";
import { ServiceError } from "../services/cartService";

const getUserId = (req: AuthenticatedRequest, res: Response): number | null => {
  const userId = req.user?.userId;
  if (typeof userId !== "number") {
    res
      .status(401)
      .json({
        code: "UNAUTHORIZED",
        message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ",
      });
    return null;
  }
  return userId;
};

export const updateReviewController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const reviewId = Number(req.params.reviewId);
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
    return res.status(400).json({ code: "INVALID_REVIEW_ID" });
  }

  const body = req.body ?? {};

  const hasRatingField =
    Object.prototype.hasOwnProperty.call(body, "rating") ||
    Object.prototype.hasOwnProperty.call(body, "score") ||
    Object.prototype.hasOwnProperty.call(body, "stars");

  const ratingRaw = body.rating ?? body.score ?? body.stars;
  const rating = hasRatingField
    ? typeof ratingRaw === "number"
      ? ratingRaw
      : ratingRaw != null
      ? Number(ratingRaw)
      : Number.NaN
    : undefined;

  let content: string | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(body, "content")) {
    const value = body.content;
    content =
      typeof value === "string" ? value : value == null ? null : String(value);
  } else if (Object.prototype.hasOwnProperty.call(body, "details")) {
    const value = body.details;
    content =
      typeof value === "string" ? value : value == null ? null : String(value);
  }

  let media: ReviewMediaInput[] | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(body, "media")) {
    if (Array.isArray(body.media)) {
      media = body.media as ReviewMediaInput[];
    } else if (body.media == null) {
      media = null;
    } else {
      return res
        .status(400)
        .json({
          code: "REVIEW_MEDIA_INVALID",
          message: "Định dạng tệp đính kèm không hợp lệ",
        });
    }
  }

  const payload: {
    rating?: number;
    content?: string | null;
    media?: ReviewMediaInput[] | null;
  } = {};

  if (hasRatingField) {
    payload.rating = rating;
  }
  if (content !== undefined) {
    payload.content = content;
  }
  if (media !== undefined) {
    payload.media = media;
  }

  try {
    const review = await updateReview(userId, reviewId, payload);
    return res.status(200).json(review);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res
        .status(err.httpStatus)
        .json({ code: err.code, message: err.message, data: err.data });
    }
    console.error("updateReviewController", err);
    return res
      .status(500)
      .json({ code: "SERVER_ERROR", message: "Không thể cập nhật đánh giá" });
  }
};

export const deleteReviewController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const reviewId = Number(req.params.reviewId);
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
    return res.status(400).json({ code: "INVALID_REVIEW_ID" });
  }

  try {
    await deleteReview(userId, reviewId);
    return res.status(204).send();
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res
        .status(err.httpStatus)
        .json({ code: err.code, message: err.message, data: err.data });
    }
    console.error("deleteReviewController", err);
    return res
      .status(500)
      .json({ code: "SERVER_ERROR", message: "Không thể xóa đánh giá" });
  }
};

export default {
  updateReviewController,
  deleteReviewController,
};

export default function PageLoading() {
  return (
    <>
      <style>
        {`
          .page-loading {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            padding: 16px 0;
            overflow: hidden;
            animation: page-loading-fade-in 0.2s ease-out;
          }

          .page-loading__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 20px;
          }

          .page-loading__title {
            width: 180px;
            height: 24px;
            border-radius: 6px;
          }

          .page-loading__action {
            width: 90px;
            height: 36px;
            border-radius: 6px;
          }

          .page-loading__search {
            width: 100%;
            height: 42px;
            margin-bottom: 18px;
            border-radius: 6px;
          }

          .page-loading__categories {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            max-width: 100%;
            margin-bottom: 20px;
            overflow: hidden;
          }

          .page-loading__category {
            flex: 0 0 auto;
            width: 72px;
            height: 32px;
            border-radius: 999px;
          }

          .page-loading__category:nth-child(2) {
            width: 94px;
          }

          .page-loading__category:nth-child(3) {
            width: 82px;
          }

          .page-loading__category:nth-child(4) {
            width: 68px;
          }

          .page-loading__list {
            width: 100%;
            max-width: 100%;
          }

          .page-loading__item {
            width: 100%;
            min-width: 0;
            padding: 18px 0;
            border-top: 1px solid rgba(0, 0, 0, 0.08);
          }

          .page-loading__item:last-child {
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          }

          .page-loading__question {
            width: 65%;
            height: 16px;
            border-radius: 5px;
            margin-bottom: 10px;
          }

          .page-loading__answer {
            width: 88%;
            height: 12px;
            border-radius: 4px;
          }

          .page-loading__skeleton {
            background: linear-gradient(
              90deg,
              rgba(0, 0, 0, 0.06) 0%,
              rgba(0, 0, 0, 0.12) 50%,
              rgba(0, 0, 0, 0.06) 100%
            );
            background-size: 200% 100%;
            animation: page-loading-shimmer 1.4s ease-in-out infinite;
          }

          @keyframes page-loading-shimmer {
            0% {
              background-position: 200% 0;
            }

            100% {
              background-position: -200% 0;
            }
          }

          @keyframes page-loading-fade-in {
            from {
              opacity: 0;
              transform: translateY(4px);
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @media screen and (max-width: 749px) {
            .page-loading {
              padding: 12px 0;
            }

            .page-loading__header {
              margin-bottom: 16px;
            }

            .page-loading__title {
              width: 140px;
              height: 22px;
            }

            .page-loading__action {
              width: 76px;
              height: 34px;
            }

            .page-loading__search {
              height: 40px;
              margin-bottom: 14px;
            }

            .page-loading__categories {
              gap: 6px;
              margin-bottom: 16px;
            }

            .page-loading__category {
              height: 30px;
            }

            .page-loading__item {
              padding: 16px 0;
            }

            .page-loading__question {
              width: 80%;
            }

            .page-loading__answer {
              width: 95%;
            }
          }

          @media screen and (max-width: 480px) {
            .page-loading__header {
              gap: 10px;
            }

            .page-loading__title {
              width: 125px;
              height: 20px;
            }

            .page-loading__action {
              width: 70px;
              height: 32px;
            }

            .page-loading__search {
              height: 38px;
            }

            .page-loading__question {
              width: 85%;
            }

            .page-loading__answer {
              width: 100%;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .page-loading {
              animation: none;
            }

            .page-loading__skeleton {
              animation: none;
            }
          }
        `}
      </style>

      <div
        className="page-loading"
        role="status"
        aria-label="Loading content"
        aria-live="polite"
      >
        <div className="page-loading__header">
          <div className="page-loading__title page-loading__skeleton" />
          <div className="page-loading__action page-loading__skeleton" />
        </div>

        <div className="page-loading__search page-loading__skeleton" />

        <div className="page-loading__categories">
          <div className="page-loading__category page-loading__skeleton" />
          <div className="page-loading__category page-loading__skeleton" />
          <div className="page-loading__category page-loading__skeleton" />
          <div className="page-loading__category page-loading__skeleton" />
        </div>

        <div className="page-loading__list">
          <div className="page-loading__item">
            <div className="page-loading__question page-loading__skeleton" />
            <div className="page-loading__answer page-loading__skeleton" />
          </div>

          <div className="page-loading__item">
            <div className="page-loading__question page-loading__skeleton" />
            <div className="page-loading__answer page-loading__skeleton" />
          </div>

          <div className="page-loading__item">
            <div className="page-loading__question page-loading__skeleton" />
            <div className="page-loading__answer page-loading__skeleton" />
          </div>

          <div className="page-loading__item">
            <div className="page-loading__question page-loading__skeleton" />
            <div className="page-loading__answer page-loading__skeleton" />
          </div>
        </div>
      </div>
    </>
  );
}

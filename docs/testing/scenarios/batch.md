# 배치 (Batch) 테스트 시나리오

## Backend Unit 테스트

### PreferenceBatchResultProcessorService

#### processResults — 정상 처리
- [x] 성공 결과 Map → preferences.analysis 업데이트 + UserTasteAnalysis upsert + MenuSelection SUCCEEDED 전이
- [x] 기존 UserTasteAnalysis 없음 → manager.save 신규 생성 (analysisVersion=1)
- [x] 기존 UserTasteAnalysis 있음 → manager.update + analysisVersion 증가
- [x] preferences.analysisVersion 증가 (기존 값 + 1), lastAnalyzedAt ISO 문자열 저장

#### processResults — 부분/전체 실패
- [x] 성공 + JSON.parse 실패 혼재 → 성공 건만 커밋, 실패 건은 markSelectionsFailedByIds 호출
- [x] response.analysis 누락/타입 오류 → 실패 처리 + MenuSelection FAILED
- [x] 모든 항목 실패 → update 0건 + 에러 로깅 + successCount=0 / failCount=N

#### processResults — customId 파싱
- [x] customId 정규식 미매칭 → invalid 경고 로그 + 실패 카운트 증가
- [x] parseCustomId — 정상 `pref_{userId}_{ids}` → { userId, selectionIds } 반환
- [x] parseCustomId — userId NaN → null
- [x] parseCustomId — selectionIds 중 일부 NaN → null

#### processResults — User 미존재 / 트랜잭션 롤백
- [x] userService.findOne 실패 → 경고 로그 + markSelectionsFailedByIds + 다음 항목 계속
- [x] manager.update 중 예외 → rollbackTransaction + markSelectionsFailedByIds + queryRunner.release
- [x] markSelectionsFailedByIds 자체가 예외 → 에러 로깅만 + 진행 계속

#### processResults — 청크 처리
- [x] BATCH_CONFIG.RESULT_CHUNK_SIZE 단위로 분할, 각 청크 로그 (`Processing chunk N/M`)

#### processErrors
- [x] BatchError 배열 → 각 customId parseCustomId 후 markSelectionsFailedByIds 호출
- [x] customId 파싱 실패 항목 → skip (continue)

#### mark/increment 헬퍼
- [x] markSelectionsBatchProcessing — 빈 배열 → repository 호출 없음
- [x] markSelectionsBatchProcessing — status BATCH_PROCESSING + batchJobId 설정
- [x] markSelectionsSucceeded — 빈 배열 → 호출 없음 / 정상 → SUCCEEDED 일괄 update
- [x] incrementRetryCount — 빈 배열 → 호출 없음 / 정상 → `retryCount + 1` raw update

### PreferencesBatchResultScheduler

#### pollAndProcessResults — advisory lock 분기
- [ ] withAdvisoryLock 획득 성공 → 내부 로직 실행 <!-- 제거: "processSingleBatch 상태 분기" 그룹 전체가 lock 획득 경로를 이미 실행하므로 중복 -->
- [x] acquired=false → `다른 인스턴스에서 이미 실행 중` 경고 + 내부 로직 미실행
- [x] timedOut=true → error 로그
- [x] openAiBatchClient.isReady() false → 경고 + { success: false } 반환

#### pollAndProcessResults — 배치 상태 분기
- [x] batchJobService.findIncomplete() 빈 배열 → 조기 반환 (processSingleBatch 미호출)
- [x] openAiBatchId 없는 batchJob → 경고 + skip
- [ ] (참고) processSingleBatch 실패는 개별 로깅만, 전체 폴링은 계속

#### processSingleBatch
- [x] getBatchStatus 호출 후 mapStatus로 전이하여 batchJobService.updateStatus 항상 호출 (상태 전이 없음이 아니라 진행률 업데이트 수행)
- [x] status=completed → handleCompletedBatch 호출
- [x] status=failed → handleFailedBatch 호출 (BatchJobStatus.FAILED + errorMessage)
- [x] status=expired → handleFailedBatch 호출 (BatchJobStatus.EXPIRED)
- [x] status=in_progress/validating/finalizing → mapStatus로 PROCESSING 전이, 별도 분기 없이 다음 배치로
- [x] getBatchStatus 예외 → 에러 로그 + 다음 배치 계속

#### handleCompletedBatch
- [x] outputFileId 있음 → downloadResults → preferenceBatchService.processResults → updateStatus(COMPLETED)
- [x] downloadResults errors 존재 → handleDownloadErrors로 processErrors 호출
- [x] processResults 예외 → handleBatchProcessingFailure (BatchJob FAILED + Selection 리셋)
- [x] errorFileId 있음 → downloadErrors → processErrors → updateStatus(COMPLETED)
- [x] errorFileId 경로 예외 → handleBatchProcessingFailure 호출

#### 예외 처리 / 알림
- [x] 상위 catch 예외 → schedulerAlertService.alertFailure 호출 후 { success: false }
- [ ] (참고) alertFailure는 상위 catch에서만. processSingleBatch 개별 실패 시에는 handleFailedBatch/로그만 호출되고 alertFailure는 호출되지 않음
- [x] mapStatus — cancelling/cancelled → BatchJobStatus.FAILED, 기본값 → PROCESSING

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { User } from '@/user/entities/user.entity';
import { OpenAiModule } from '@/external/openai/openai.module';
import { UserModule } from '@/user/user.module';
import { SchedulerAlertModule } from '@/common/services/scheduler-alert.module';
import { BatchJob } from './entities/batch-job.entity';
import { BatchJobService } from './services/batch-job.service';
import { PreferenceBatchService } from './services/preference-batch.service';
import { SelectionGroupingService } from './services/selection-grouping.service';
import { BatchRequestBuilderService } from './services/batch-request-builder.service';
import { PreferenceBatchResultProcessorService } from './services/preference-batch-result-processor.service';
import { MenuSelectionSeederService } from './services/menu-selection-seeder.service';
import { PreferencesBatchScheduler } from './schedulers/preferences-batch.scheduler';
import { PreferencesBatchResultScheduler } from './schedulers/preferences-batch-result.scheduler';
import { PreferencesRetryBatchScheduler } from './schedulers/preferences-retry-batch.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([BatchJob, MenuSelection, User]),
    OpenAiModule,
    UserModule,
    SchedulerAlertModule,
  ],
  providers: [
    // Services
    BatchJobService,
    SelectionGroupingService,
    BatchRequestBuilderService,
    PreferenceBatchResultProcessorService,
    PreferenceBatchService,
    MenuSelectionSeederService,
    // Schedulers
    PreferencesBatchScheduler,
    PreferencesBatchResultScheduler,
    PreferencesRetryBatchScheduler,
  ],
  exports: [BatchJobService, PreferenceBatchService],
})
export class BatchModule {}

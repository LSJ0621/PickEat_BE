import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GoogleOAuthClient } from './clients/google-oauth.client';
import { GooglePlacesClient } from './clients/google-places.client';
import { GoogleSearchClient } from './clients/google-search.client';

@Module({
  imports: [HttpModule],
  providers: [GooglePlacesClient, GoogleSearchClient, GoogleOAuthClient],
  exports: [GooglePlacesClient, GoogleSearchClient, GoogleOAuthClient],
})
export class GoogleModule {}


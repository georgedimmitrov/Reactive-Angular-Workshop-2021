import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import {
    debounceTime,
    distinctUntilChanged,
    map,
    shareReplay,
    switchMap,
    tap,
} from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Hero {
    id: number;
    name: string;
    description: string;
    thumbnail: HeroThumbnail;
    resourceURI: string;
    comics: HeroSubItems;
    events: HeroSubItems;
    series: HeroSubItems;
    stories: HeroSubItems;
}

export interface HeroThumbnail {
    path: string;
    extendion: string;
}

export interface HeroSubItems {
    available: number;
    returned: number;
    collectionURI: string;
    items: HeroSubItem[];
}

export interface HeroSubItem {
    resourceURI: string;
    name: string;
}

// The URL to the Marvel API
const HERO_API = `${environment.MARVEL_API.URL}/v1/public/characters`;

// Our Limits for Search
const LIMIT_LOW = 10;
const LIMIT_MID = 25;
const LIMIT_HIGH = 100;
const LIMITS = [LIMIT_LOW, LIMIT_MID, LIMIT_HIGH];

export const DEFAULT_LIMIT = LIMIT_HIGH;
export const DEFAULT_SEARCH = '';
export const DEFAULT_PAGE = 0;

@Injectable({
    providedIn: 'root',
})
export class HeroService {
    limits = LIMITS;

    private searchBS = new BehaviorSubject<string>(DEFAULT_SEARCH);
    private limitBS = new BehaviorSubject<number>(DEFAULT_LIMIT);
    private pageBS = new BehaviorSubject<number>(DEFAULT_PAGE);
    private loadingBS = new BehaviorSubject(false);

    search$ = this.searchBS.asObservable();
    limit$ = this.limitBS.asObservable();
    page$ = this.pageBS.asObservable();
    loading$ = this.loadingBS.asObservable();

    userPage$ = this.pageBS.pipe(map(page => page + 1));

    private heroesResponseCache = {};

    private params$ = combineLatest([
        this.searchBS.pipe(debounceTime(500)),
        this.limitBS,
        this.pageBS.pipe(debounceTime(500)),
    ]).pipe(
        map(([searchTerm, limit, page]) => {
            const params: any = {
                apikey: environment.MARVEL_API.PUBLIC_KEY,
                limit: `${limit}`,
                offset: `${page * limit}`,
            };

            if (searchTerm.length) {
                params.nameStartsWith = searchTerm;
            }
            return params;
        }),
    );

    private heroesResponse$ = this.params$.pipe(
        distinctUntilChanged((prev, curr) => {
            return JSON.stringify(prev) === JSON.stringify(curr);
        }),
        tap(() => this.loadingBS.next(true)),
        switchMap(_params => {
            const paramsStr = JSON.stringify(_params);
            if (this.heroesResponseCache[paramsStr]) {
                return of(this.heroesResponseCache[paramsStr]);
            }
            return this.http
                .get(HERO_API, {
                    params: _params,
                })
                .pipe(
                    tap(
                        (res: any) =>
                            (this.heroesResponseCache[paramsStr] = res),
                    ),
                );
        }),
        tap(() => this.loadingBS.next(false)),
        shareReplay(1),
    );

    totalResults$: Observable<number> = this.heroesResponse$.pipe(
        map((res: any) => res.data.total),
    );

    heroes$: Observable<Hero[]> = this.heroesResponse$.pipe(
        map((res: any) => res.data.results),
    );

    totalPages$ = combineLatest([this.totalResults$, this.limitBS]).pipe(
        map(([totalResults, limit]) => Math.ceil(totalResults / limit)),
    );

    constructor(private http: HttpClient) {}

    doSearch(term: string) {
        this.searchBS.next(term);
        this.pageBS.next(DEFAULT_PAGE);
    }

    movePageBy(moveBy: number) {
        const currentPage = this.pageBS.getValue();
        this.pageBS.next(currentPage + moveBy);
    }

    setLimit(newLimit: number) {
        this.limitBS.next(newLimit);
        this.pageBS.next(DEFAULT_PAGE);
    }
}

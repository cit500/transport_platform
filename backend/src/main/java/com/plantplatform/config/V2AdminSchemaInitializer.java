package com.plantplatform.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/** Ensures the small reusable scenario-library tables exist in the V2 database. */
@Component
public class V2AdminSchemaInitializer {

    private final DataSource dataSource;

    public V2AdminSchemaInitializer(@Qualifier("v2DataSource") DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @PostConstruct
    public void initialize() {
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
            new ClassPathResource("v2-admin-schema.sql"),
            new ClassPathResource("v2-disaster-schema.sql"),
            new ClassPathResource("v2-resilience-schema.sql"));
        populator.setSqlScriptEncoding("UTF-8");
        populator.setContinueOnError(false);
        populator.execute(dataSource);
    }
}

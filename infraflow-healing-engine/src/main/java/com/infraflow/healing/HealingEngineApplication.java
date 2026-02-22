package com.infraflow.healing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
@EntityScan(basePackages = "com.infraflow.common.model")
public class HealingEngineApplication {
    public static void main(String[] args) {
        SpringApplication.run(HealingEngineApplication.class, args);
    }
}
